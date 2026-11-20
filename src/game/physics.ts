import * as THREE from 'three';
import {
  BuiltTrackData,
  CheckpointGate,
  InterpolatedRoadFrame,
  findNearestTrackSample,
  sampleInterpolatedRoadFrame,
} from './tracks';
import { VehicleId } from './types';

export interface VehicleInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (right) .. +1 (left)
  drift: boolean;
}

export interface VehiclePhysicsState {
  position: THREE.Vector3;
  prevPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number; // radians, forward = (-sin(yaw), 0, -cos(yaw))
  prevYaw: number;
  pitch: number;
  prevPitch: number;
  roll: number;
  prevRoll: number;
  speed: number; // signed forward speed m/s
  steerSmoothed: number;
  driftAngle: number; // visual slip yaw offset
  prevDriftAngle: number;
  driftDir: number; // -1 right drift, +1 left drift, 0 none
  isDrifting: boolean;
  driftCharge: number; // 0..1
  driftTier: 0 | 1 | 2 | 3;
  boostTimer: number;
  boostStrength: number;
  grounded: boolean;
  heightAboveRoad: number;
  nearestSampleIdx: number;
  trackT: number;
  unwrappedProgress: number; // monotonic progress [~0..1+] for exact ghost delta
  lateralOffset: number;
  offTrack: boolean;
  wallHitImpulse: number; // >0 on frame of wall bump
  boostJustTriggeredTier: number; // >0 on frame boost triggers
}

export interface VehicleTuning {
  maxSpeed: number; // m/s (1 m/s ≈ 3.6 km/h)
  boostBonusSpeed: number;
  accel: number;
  brakeDecel: number;
  reverseMax: number;
  drag: number;
  baseTurnRate: number;
  driftTurnBonus: number;
  driftLateralGrip: number;
  normalLateralGrip: number;
  driftChargeRate: number;
  driftMinSpeed: number;
  driftScrub: number;
  visualSlipMax: number;
  hoverClearance: number;
  /** Clearance offset past roadHalfWidth so car edge stops flush at wall inner face (roadHalfWidth + 1.15m) */
  wallEdgeOffset: number;
}

export const VEHICLE_TUNING: Record<VehicleId, VehicleTuning> = {
  'drift-car': {
    maxSpeed: 68.0, // ~245 km/h
    boostBonusSpeed: 28.0, // strong turbo payoff on clean drift release
    accel: 41.0,
    brakeDecel: 58.0,
    reverseMax: 16.0,
    drag: 0.42,
    baseTurnRate: 1.92,
    driftTurnBonus: 1.05,
    driftLateralGrip: 3.85,
    normalLateralGrip: 9.8,
    driftChargeRate: 0.72,
    driftMinSpeed: 18.0,
    driftScrub: 0.06,
    visualSlipMax: 0.42,
    hoverClearance: 0.0,
    wallEdgeOffset: 0.16, // wall starts at +1.15m, car half-width ~0.99m -> flush contact, zero clip
  },
  hovercraft: {
    maxSpeed: 79.0, // ~285 km/h
    boostBonusSpeed: 31.0,
    accel: 47.0,
    brakeDecel: 50.0,
    reverseMax: 18.0,
    drag: 0.34,
    baseTurnRate: 1.82,
    driftTurnBonus: 1.32,
    driftLateralGrip: 2.95,
    normalLateralGrip: 5.6,
    driftChargeRate: 0.78,
    driftMinSpeed: 20.0,
    driftScrub: 0.05,
    visualSlipMax: 0.34,
    hoverClearance: 0.25,
    wallEdgeOffset: 0.24, // hovercraft fuselage clearance inside wall face
  },
};

// Module-scoped scratch helpers (zero GC in 120Hz physics tick)
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _prevPos = new THREE.Vector3();
const _gateRelPrev = new THREE.Vector3();
const _gateRelCurr = new THREE.Vector3();
const _roadFrame: InterpolatedRoadFrame = {
  sampleIndex: 0,
  t: 0,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  right: new THREE.Vector3(),
  up: new THREE.Vector3(0, 1, 0),
  bank: 0,
  lateral: 0,
  roadY: 0,
  distSq: 0,
};

export function createInitialPhysicsState(track: BuiltTrackData): VehiclePhysicsState {
  const state: VehiclePhysicsState = {
    position: new THREE.Vector3(),
    prevPosition: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    yaw: 0,
    prevYaw: 0,
    pitch: 0,
    prevPitch: 0,
    roll: 0,
    prevRoll: 0,
    speed: 0,
    steerSmoothed: 0,
    driftAngle: 0,
    prevDriftAngle: 0,
    driftDir: 0,
    isDrifting: false,
    driftCharge: 0,
    driftTier: 0,
    boostTimer: 0,
    boostStrength: 0,
    grounded: true,
    heightAboveRoad: 0,
    nearestSampleIdx: 0,
    trackT: 0,
    unwrappedProgress: 0,
    lateralOffset: 0,
    offTrack: false,
    wallHitImpulse: 0,
    boostJustTriggeredTier: 0,
  };
  placeStateAtGate(state, track, track.checkpoints[0], -5.5);
  return state;
}

export function placeStateAtGate(
  state: VehiclePhysicsState,
  track: BuiltTrackData,
  gate: CheckpointGate,
  alongOffset = 0,
  vehicleId: VehicleId = 'drift-car'
): void {
  state.position.copy(gate.position).addScaledVector(gate.tangent, alongOffset);
  const nearest = findNearestTrackSample(track, state.position.x, state.position.z, 0);
  sampleInterpolatedRoadFrame(track, state.position.x, state.position.z, nearest.sampleIndex, _roadFrame);
  state.position.y = _roadFrame.roadY + VEHICLE_TUNING[vehicleId].hoverClearance;
  state.prevPosition.copy(state.position);
  state.velocity.set(0, 0, 0);
  state.yaw = Math.atan2(-_roadFrame.tangent.x, -_roadFrame.tangent.z);
  state.prevYaw = state.yaw;
  state.pitch = Math.asin(THREE.MathUtils.clamp(_roadFrame.tangent.y, -0.8, 0.8));
  state.prevPitch = state.pitch;
  state.roll = -_roadFrame.bank;
  state.prevRoll = state.roll;
  state.speed = 0;
  state.steerSmoothed = 0;
  state.driftAngle = 0;
  state.prevDriftAngle = 0;
  state.driftDir = 0;
  state.isDrifting = false;
  state.driftCharge = 0;
  state.driftTier = 0;
  state.boostTimer = 0;
  state.boostStrength = 0;
  state.grounded = true;
  state.heightAboveRoad = 0;
  state.offTrack = false;
  state.wallHitImpulse = 0;
  state.boostJustTriggeredTier = 0;

  state.nearestSampleIdx = _roadFrame.sampleIndex;
  state.trackT = _roadFrame.t;
  state.unwrappedProgress =
    gate.index === 0 && alongOffset < 0
      ? _roadFrame.t > 0.5
        ? _roadFrame.t - 1
        : _roadFrame.t
      : gate.t;
  state.lateralOffset = _roadFrame.lateral;
}

export function getVehicleMaxSpeedKmh(vehicleId: VehicleId): number {
  return Math.round(VEHICLE_TUNING[vehicleId].maxSpeed * 3.6);
}

/**
 * Advances vehicle kinematics by a fixed timestep `dt` (typically 1/120s).
 * Returns the exact sub-step crossing fraction `f ∈ [0, 1]` when crossing `targetGate`
 * in the forward direction, or `null` if not crossed during this step.
 */
export function stepVehiclePhysics(
  state: VehiclePhysicsState,
  track: BuiltTrackData,
  vehicleId: VehicleId,
  input: VehicleInput,
  dt: number,
  targetGate: CheckpointGate | null
): number | null {
  const tune = VEHICLE_TUNING[vehicleId];
  state.wallHitImpulse = 0;
  state.boostJustTriggeredTier = 0;

  // Snapshot previous pose for smooth 75Hz/144Hz render interpolation
  state.prevPosition.copy(state.position);
  state.prevYaw = state.yaw;
  state.prevPitch = state.pitch;
  state.prevRoll = state.roll;
  state.prevDriftAngle = state.driftAngle;
  _prevPos.copy(state.position);

  const prevTrackT = state.trackT;

  // Smooth steering input
  const steerLerp = 1 - Math.exp(-15 * dt);
  state.steerSmoothed += (input.steer - state.steerSmoothed) * steerLerp;

  // Compute current forward & right unit vectors on XZ plane
  _fwd.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  _right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));

  const forwardSpeed = state.velocity.x * _fwd.x + state.velocity.z * _fwd.z;
  const lateralSpeed = state.velocity.x * _right.x + state.velocity.z * _right.z;
  state.speed = forwardSpeed;

  // Drift engagement / release logic
  const canDrift = state.grounded && forwardSpeed > tune.driftMinSpeed;
  if (input.drift && canDrift) {
    if (!state.isDrifting) {
      if (Math.abs(state.steerSmoothed) > 0.1) {
        state.isDrifting = true;
        state.driftDir = state.steerSmoothed > 0 ? 1 : -1;
      }
    } else {
      // Reward clean committed cornering drifts; gently penalize curb/off-track sloppy drifts
      const steerCommitment = 0.6 + Math.max(0, state.steerSmoothed * state.driftDir) * 0.72;
      const cleanMultiplier = state.offTrack ? 0.45 : 1.0;
      state.driftCharge = Math.min(
        1,
        state.driftCharge + tune.driftChargeRate * steerCommitment * cleanMultiplier * dt
      );
    }
  } else if (state.isDrifting) {
    // Released drift -> Fire rewarding turbo surge if Tier 1+ reached!
    if (state.driftTier >= 1) {
      const durations = [0, 0.95, 1.55, 2.25];
      const strengths = [0, 0.65, 0.88, 1.15];
      state.boostTimer = durations[state.driftTier];
      state.boostStrength = strengths[state.driftTier];
      state.boostJustTriggeredTier = state.driftTier;
    }
    state.isDrifting = false;
    state.driftDir = 0;
    state.driftCharge = 0;
    state.driftTier = 0;
  } else {
    state.driftCharge = Math.max(0, state.driftCharge - 1.5 * dt);
  }

  // Update 3-tier drift charge level
  if (state.driftCharge >= 0.86) state.driftTier = 3;
  else if (state.driftCharge >= 0.48) state.driftTier = 2;
  else if (state.driftCharge >= 0.2) state.driftTier = 1;
  else state.driftTier = 0;

  // Active boost countdown
  if (state.boostTimer > 0) {
    state.boostTimer = Math.max(0, state.boostTimer - dt);
    if (state.boostTimer === 0) state.boostStrength = 0;
  }

  // Steering & yaw rate
  const speedSteerFactor = THREE.MathUtils.clamp(Math.abs(forwardSpeed) / 13, 0, 1);
  const reverseSign = forwardSpeed >= -0.5 ? 1 : -1;
  let yawRate = 0;

  if (state.isDrifting) {
    const steerMod = 0.42 + state.steerSmoothed * state.driftDir * 0.62;
    yawRate =
      state.driftDir *
      (tune.baseTurnRate * 0.62 + tune.driftTurnBonus) *
      THREE.MathUtils.clamp(steerMod, 0.05, 1.25) *
      speedSteerFactor;
  } else {
    const highSpeedStability = 1 - THREE.MathUtils.clamp(forwardSpeed / (tune.maxSpeed * 2.1), 0, 0.34);
    yawRate = state.steerSmoothed * tune.baseTurnRate * highSpeedStability * speedSteerFactor * reverseSign;
  }
  state.yaw += yawRate * dt;

  // Visual slip angle for juicy PolyTrack / HexGL tail-out feel
  const targetDriftAngle = state.isDrifting
    ? state.driftDir * tune.visualSlipMax * (0.65 + 0.35 * Math.abs(state.steerSmoothed))
    : 0;
  state.driftAngle += (targetDriftAngle - state.driftAngle) * (1 - Math.exp(-10 * dt));

  // Recompute forward/right after yaw update
  _fwd.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  _right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));

  // Longitudinal acceleration, braking, boost, curb off-track penalty, and drag
  const effectiveMax = tune.maxSpeed + tune.boostBonusSpeed * state.boostStrength;
  let newForward = forwardSpeed;

  if (state.grounded) {
    if (input.throttle > 0) {
      const accelCurve = 1 - THREE.MathUtils.clamp(forwardSpeed / effectiveMax, 0, 0.85) * 0.52;
      newForward += tune.accel * input.throttle * accelCurve * dt;
    }
    if (input.brake > 0) {
      if (forwardSpeed > 1.5) {
        newForward -= tune.brakeDecel * input.brake * dt;
      } else {
        newForward -= tune.accel * 0.65 * input.brake * dt;
      }
    }
    if (state.boostTimer > 0) {
      // Crisp immediate launch kick on drift release
      newForward += tune.accel * 1.85 * state.boostStrength * dt;
    }

    const driftScrub = state.isDrifting ? tune.driftScrub : 0;
    const curbDrag = state.offTrack ? 0.68 : 0;
    const totalDrag = tune.drag + driftScrub + curbDrag;
    newForward *= Math.exp(-totalDrag * dt);
    newForward = THREE.MathUtils.clamp(newForward, -tune.reverseMax, effectiveMax);
  } else {
    newForward *= Math.exp(-0.1 * dt);
  }

  // Lateral grip damping
  const lateralGrip = state.grounded
    ? state.isDrifting
      ? tune.driftLateralGrip
      : tune.normalLateralGrip
    : 0.4;
  const newLateral = lateralSpeed * Math.exp(-lateralGrip * dt);

  state.velocity.x = _fwd.x * newForward + _right.x * newLateral;
  state.velocity.z = _fwd.z * newForward + _right.z * newLateral;

  // Integrate XZ position
  state.position.x += state.velocity.x * dt;
  state.position.z += state.velocity.z * dt;

  // Continuous 2-sample interpolated road frame (fixes both road lookup bug & 0.3m height stepping)
  sampleInterpolatedRoadFrame(
    track,
    state.position.x,
    state.position.z,
    state.nearestSampleIdx,
    _roadFrame
  );
  state.nearestSampleIdx = _roadFrame.sampleIndex;
  state.trackT = _roadFrame.t;
  state.lateralOffset = _roadFrame.lateral;

  // Update monotonic unwrapped progress for exact ghost time-at-progress delta
  let dtProg = state.trackT - prevTrackT;
  if (dtProg < -0.5) dtProg += 1;
  else if (dtProg > 0.5) dtProg -= 1;
  state.unwrappedProgress += dtProg;

  // Accurate parapet collision: inner wall face (roadHalfWidth + 1.15m) minus vehicle half-width
  const wallLimit = track.roadHalfWidth + tune.wallEdgeOffset;

  if (Math.abs(state.lateralOffset) > wallLimit) {
    const sign = state.lateralOffset > 0 ? 1 : -1;
    const clampedLat = sign * wallLimit;
    const penetration = Math.abs(state.lateralOffset) - wallLimit;

    const expectedRoadY = _roadFrame.position.y + clampedLat * Math.tan(_roadFrame.bank);
    if (Math.abs(state.position.y - expectedRoadY) < 4.5) {
      state.position.x = _roadFrame.position.x + _roadFrame.right.x * clampedLat;
      state.position.z = _roadFrame.position.z + _roadFrame.right.z * clampedLat;
      state.lateralOffset = clampedLat;

      const outwardVel =
        state.velocity.x * _roadFrame.right.x * sign +
        state.velocity.z * _roadFrame.right.z * sign;
      if (outwardVel > 0) {
        state.velocity.x -= _roadFrame.right.x * sign * outwardVel * 1.12;
        state.velocity.z -= _roadFrame.right.z * sign * outwardVel * 1.12;
        // Noticeable speed penalty for scraping concrete parapets so braking/drifting pays off
        state.velocity.x *= 0.88;
        state.velocity.z *= 0.88;
        if (outwardVel > 3.8 || penetration > 0.25) {
          state.wallHitImpulse = THREE.MathUtils.clamp(outwardVel / 20, 0.2, 1);
        }
      }

      // Gently align yaw slightly along parapet if grazing at shallow angle
      const tanYaw = Math.atan2(-_roadFrame.tangent.x, -_roadFrame.tangent.z);
      let yawDiff = ((tanYaw - state.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      if (Math.abs(yawDiff) < 1.1) {
        state.yaw += yawDiff * Math.min(1, 5 * dt);
      }
    }
  }

  // Smooth interpolated road surface elevation + speed-sensitive crest jump physics
  const roadSurfaceY =
    _roadFrame.position.y + state.lateralOffset * Math.tan(_roadFrame.bank) + tune.hoverClearance;

  const gravity = 32.0;
  if (!state.grounded) {
    state.velocity.y -= gravity * dt;
    state.position.y += state.velocity.y * dt;
    if (state.position.y <= roadSurfaceY) {
      state.position.y = roadSurfaceY;
      state.velocity.y = 0;
      state.grounded = true;
    }
  } else {
    const slopeY = _roadFrame.tangent.y * newForward;
    // Launch smoothly into air over sharp crests (e.g. Skyway Summit) when climbing fast
    const crestDropVel = state.velocity.y - slopeY;
    if (crestDropVel > 4.2 && newForward > 46 && state.velocity.y > 2.5) {
      state.grounded = false;
      state.position.y += state.velocity.y * dt;
    } else {
      state.position.y = roadSurfaceY;
      state.velocity.y = slopeY;
    }
  }

  state.heightAboveRoad = Math.max(0, state.position.y - roadSurfaceY);
  // Off-track when vehicle center crosses onto outer painted curb strip beyond asphalt edge
  state.offTrack = Math.abs(state.lateralOffset) > track.roadHalfWidth - 0.15;

  // Align chassis pitch & roll smoothly with interpolated road grade & banking
  const targetPitch = state.grounded
    ? Math.asin(THREE.MathUtils.clamp(_roadFrame.tangent.y * _roadFrame.tangent.dot(_fwd), -0.65, 0.65))
    : THREE.MathUtils.clamp(state.velocity.y * 0.018, -0.35, 0.35);
  const targetRoll = state.grounded ? -_roadFrame.bank * _roadFrame.tangent.dot(_fwd) : 0;
  const orientLerp = 1 - Math.exp(-12 * dt);
  state.pitch += (targetPitch - state.pitch) * orientLerp;
  state.roll += (targetRoll - state.roll) * orientLerp;

  // Sub-millisecond checkpoint plane-crossing interpolation
  if (targetGate) {
    _gateRelPrev.subVectors(_prevPos, targetGate.position);
    _gateRelCurr.subVectors(state.position, targetGate.position);
    const prevDot = _gateRelPrev.dot(targetGate.tangent);
    const currDot = _gateRelCurr.dot(targetGate.tangent);
    if (prevDot < 0 && currDot >= 0) {
      const denom = prevDot - currDot;
      const frac = Math.abs(denom) > 1e-7 ? THREE.MathUtils.clamp(prevDot / denom, 0, 1) : 1;
      const crossLat = Math.abs(
        _gateRelPrev.dot(targetGate.right) * (1 - frac) +
          _gateRelCurr.dot(targetGate.right) * frac
      );
      const crossVert = Math.abs(_gateRelPrev.y * (1 - frac) + _gateRelCurr.y * frac);
      if (crossLat <= targetGate.halfWidth + 3.5 && crossVert < 12) {
        return frac;
      }
    }
  }

  return null;
}
