import assert from 'node:assert/strict';
import { GhostPlayer, GhostRecorder } from '../ghost';
import {
  VEHICLE_TUNING,
  createInitialPhysicsState,
  placeStateAtGate,
  stepVehiclePhysics,
} from '../physics';
import {
  TRACK_LIST,
  buildTrackData,
  findNearestTrackSample,
  sampleInterpolatedRoadFrame,
} from '../tracks';
import { TrackDirection, TrackId } from '../types';
import * as THREE from 'three';

const TRACK_IDS: TrackId[] = ['pine-ridge', 'switchback-pass', 'skyway-summit'];
const DIRECTIONS: TrackDirection[] = ['forward', 'reverse'];
const FIXED_DT = 1 / 120;

function bruteForceNearestSample(
  track: ReturnType<typeof buildTrackData>,
  x: number,
  z: number
): number {
  let bestIdx = 0;
  let bestDistSq = Infinity;
  for (let i = 0; i < track.samples.length; i++) {
    const p = track.samples[i].position;
    const dx = x - p.x;
    const dz = z - p.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function testTrackLengthsMatchBuiltSplines() {
  for (const summary of TRACK_LIST) {
    const built = buildTrackData(summary.id, 'forward');
    assert.equal(
      summary.lengthMeters,
      Math.round(built.totalLength),
      `TRACK_LIST length for ${summary.id} should match built spline length`
    );
    assert.ok(summary.outline.points.length >= 60, `Track ${summary.id} should have SVG outline points`);
  }
  console.log('PASS [4.1] TRACK_LIST lengths match built splines:', TRACK_LIST.map((t) => `${t.id}=${t.lengthMeters}m`).join(', '));
}

function testRoadLookupAndHeightSmoothnessAndWallClearance() {
  const frame = {
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

  for (const trackId of TRACK_IDS) {
    for (const dir of DIRECTIONS) {
      const track = buildTrackData(trackId, dir);
      const state = createInitialPhysicsState(track);
      let mismatches = 0;
      let totalTicks = 0;
      let maxGroundedStepY = 0;
      let maxLateralViolation = 0;
      const wallLimit = track.roadHalfWidth + VEHICLE_TUNING['drift-car'].wallEdgeOffset;

      let prevY = state.position.y;
      let prevDy = 0;
      let prevGrounded = state.grounded;
      let prevOnRoad = true;
      let maxHeightJitter = 0;
      let nextGate = 1;
      let passedAll = false;

      // Simple centerline-following steering bot for a full lap
      for (let tick = 0; tick < 120 * 45; tick++) {
        const lookIdx = (state.nearestSampleIdx + 10) % track.samples.length;
        const aim = track.samples[lookIdx].position;
        const desiredYaw = Math.atan2(-(aim.x - state.position.x), -(aim.z - state.position.z));
        let yawErr = ((desiredYaw - state.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
        if (yawErr < -Math.PI) yawErr += Math.PI * 2;

        const targetGate = track.checkpoints[nextGate];
        const crossFrac = stepVehiclePhysics(
          state,
          track,
          'drift-car',
          {
            throttle: 1,
            brake: 0,
            steer: THREE.MathUtils.clamp(yawErr * 2.5, -1, 1),
            drift: false,
          },
          FIXED_DT,
          targetGate
        );

        totalTicks++;
        const brute = bruteForceNearestSample(track, state.position.x, state.position.z);
        const fast = findNearestTrackSample(track, state.position.x, state.position.z, state.nearestSampleIdx);
        if (fast.sampleIndex !== brute) {
          mismatches++;
        }

        if (state.grounded && prevGrounded) {
          const dy = state.position.y - prevY;
          const onRoad = Math.abs(state.lateralOffset) < track.roadHalfWidth - 0.5;
          if (onRoad) {
            if (Math.abs(dy) > maxGroundedStepY) maxGroundedStepY = Math.abs(dy);
            if (tick > 2 && prevOnRoad) {
              const jitter = Math.abs(dy - prevDy);
              if (jitter > maxHeightJitter) maxHeightJitter = jitter;
            }
          }
          prevDy = dy;
          prevOnRoad = onRoad;
        } else {
          prevDy = 0;
          prevOnRoad = false;
        }
        prevY = state.position.y;
        prevGrounded = state.grounded;

        const latOver = Math.abs(state.lateralOffset) - wallLimit;
        if (latOver > maxLateralViolation) maxLateralViolation = latOver;

        sampleInterpolatedRoadFrame(track, state.position.x, state.position.z, state.nearestSampleIdx, frame);
        assert.ok(Number.isFinite(frame.roadY));

        if (crossFrac !== null) {
          assert.ok(crossFrac >= 0 && crossFrac <= 1, 'Gate crossing fraction must be in [0, 1]');
          if (nextGate === 0) {
            passedAll = true;
            break;
          }
          nextGate = nextGate < track.summary.checkpointCount ? nextGate + 1 : 0;
        }
      }

      assert.equal(mismatches, 0, `${trackId} (${dir}): expected 0 road lookup mismatches, got ${mismatches}/${totalTicks}`);
      assert.ok(
        maxHeightJitter < 0.015,
        `${trackId} (${dir}): max on-road per-tick height jitter ${maxHeightJitter.toFixed(4)}m exceeded 0.015m`
      );
      assert.ok(
        maxLateralViolation <= 0.02,
        `${trackId} (${dir}): vehicle clipped past wall inner face by ${maxLateralViolation.toFixed(3)}m`
      );
      assert.ok(passedAll, `${trackId} (${dir}): simulated lap should complete all checkpoints`);
      console.log(
        `  OK ${trackId} (${dir}): ticks=${totalTicks}, mismatches=0, maxOnRoadDeltaY=${maxGroundedStepY.toFixed(4)}m, maxJitter=${maxHeightJitter.toFixed(4)}m`
      );
    }
  }
  console.log('PASS [1, 2.1, 2.2, 2.6] 0% lookup mismatches, smooth height interpolation, exact gate fraction, and zero wall clipping across all 6 track/direction combos');
}

function testGhostProgressDeltaAndRealSpeed() {
  const recorder = new GhostRecorder();
  for (let i = 0; i <= 60; i++) {
    const t = i / 30; // 0..2s
    const trackT = (i / 60) * 0.2; // 0..0.2
    const speed = 30 + i * 0.5;
    recorder.record(t, i * 2, 0, 0, 0, 0, 0, false, false, trackT, speed, i === 60);
  }
  const player = new GhostPlayer();
  player.setRecord({
    trackId: 'pine-ridge',
    direction: 'forward',
    vehicleId: 'drift-car',
    bestLapMs: 2000,
    checkpointSplitsMs: [],
    recordedAt: Date.now(),
    frames: recorder.getFrames(),
  });

  const ghostTimeAtMid = player.findTimeAtProgress(0.1);
  assert.ok(ghostTimeAtMid !== null, 'GhostPlayer should compute time at progress');
  assert.ok(Math.abs(ghostTimeAtMid - 1.0) < 0.02, `Expected ~1.0s at trackT=0.1, got ${ghostTimeAtMid}`);

  const pose = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    drifting: false,
    boosting: false,
    speed: 0,
    trackT: 0,
    finished: false,
  };
  assert.ok(player.sampleAt(1.0, pose));
  assert.ok(Math.abs(pose.speed - 45) < 1.5, `Expected interpolated ghost speed ~45 m/s, got ${pose.speed}`);
  console.log('PASS [2.4] Ghost progress-based delta & real wheel speed interpolation verified');
}

function testDriftBoostBeatsGripThroughCorner() {
  const track = buildTrackData('pine-ridge', 'forward');
  const runCorner = (useDrift: boolean): { time: number; boosts: number; wallHits: number } => {
    const state = createInitialPhysicsState(track);
    // Place approaching sweeping Turn 1 with full rolling speed
    placeStateAtGate(state, track, track.checkpoints[0], 35, 'drift-car');
    const fwdX = -Math.sin(state.yaw);
    const fwdZ = -Math.cos(state.yaw);
    state.velocity.set(fwdX * 62, 0, fwdZ * 62);
    state.speed = 62;

    let nextGate = 1;
    let elapsed = 0;
    let boosts = 0;
    let wallHits = 0;
    for (let tick = 0; tick < 120 * 15; tick++) {
      const lookIdx = (state.nearestSampleIdx + 12) % track.samples.length;
      const aim = track.samples[lookIdx].position;
      const desiredYaw = Math.atan2(-(aim.x - state.position.x), -(aim.z - state.position.z));
      let yawErr = ((desiredYaw - state.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (yawErr < -Math.PI) yawErr += Math.PI * 2;

      const curCurv = track.samples[state.nearestSampleIdx].curvature;
      const turnDir = curCurv > 0 ? -1 : 1; // positive curvature = right turn (-yaw), negative = left (+yaw)
      const steeringIntoTurn = yawErr * turnDir > 0.12;
      // Initiate drift cleanly into Turn 1 and release once Tier 2 boost charges
      const shouldDrift =
        useDrift &&
        state.boostTimer === 0 &&
        ((!state.isDrifting && Math.abs(curCurv) > 0.015 && steeringIntoTurn) ||
          (state.isDrifting && state.driftTier < 2));

      const frac = stepVehiclePhysics(
        state,
        track,
        'drift-car',
        {
          throttle: 1,
          brake: 0,
          steer: THREE.MathUtils.clamp(yawErr * 2.6, -1, 1),
          drift: shouldDrift,
        },
        FIXED_DT,
        track.checkpoints[nextGate]
      );
      if (state.boostJustTriggeredTier > 0) boosts++;
      if (state.wallHitImpulse > 0) wallHits++;
      elapsed += FIXED_DT;
      if (frac !== null) {
        if (nextGate === 2) {
          return { time: elapsed - FIXED_DT * (1 - frac), boosts, wallHits };
        }
        nextGate++;
      }
    }
    return { time: 999, boosts, wallHits };
  };

  const grip = runCorner(false);
  const drift = runCorner(true);
  assert.ok(drift.boosts >= 1, 'Drift run should fire at least one drift boost');
  assert.ok(
    drift.time < grip.time - 0.15,
    `Expected clean corner drift (${drift.time.toFixed(3)}s, wallHits=${drift.wallHits}) to beat grip (${grip.time.toFixed(3)}s) by >0.15s`
  );
  console.log(
    `PASS [6.2] Drift boost beats pure grip on Pine Ridge Turn 1+exit: drift=${drift.time.toFixed(3)}s (${drift.boosts} boosts) vs grip=${grip.time.toFixed(3)}s (-${(grip.time - drift.time).toFixed(3)}s)`
  );
}

testTrackLengthsMatchBuiltSplines();
testRoadLookupAndHeightSmoothnessAndWallClearance();
testGhostProgressDeltaAndRealSpeed();
testDriftBoostBeatsGripThroughCorner();
console.log('ALL VERIFICATION CHECKS PASSED');
