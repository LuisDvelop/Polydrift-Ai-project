import * as THREE from 'three';
import { TrackDirection, TrackId, TrackOutline, TrackSummary } from './types';

export interface TrackControlPoint {
  pos: [number, number, number];
  bank: number; // radians, positive banks left-side up / inward
}

export interface TrackSample {
  t: number; // normalized [0, 1)
  distance: number; // arc length from start in meters
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  bank: number;
  curvature: number;
}

export interface InterpolatedRoadFrame {
  sampleIndex: number;
  t: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  bank: number;
  lateral: number;
  roadY: number;
  distSq: number;
}

export interface CheckpointGate {
  index: number; // 0 = start/finish, 1..N = checkpoints
  t: number;
  distance: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  halfWidth: number;
}

export interface BuiltTrackData {
  summary: TrackSummary;
  direction: TrackDirection;
  curve: THREE.CatmullRomCurve3;
  samples: TrackSample[];
  totalLength: number;
  roadHalfWidth: number;
  checkpoints: CheckpointGate[]; // index 0 is start/finish, 1..N are sequential checkpoints
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  seed: number;
  terrainHeightAt: (x: number, z: number) => number;
  distanceToRoad2D: (x: number, z: number) => {
    distSq: number;
    sampleIndex: number;
    lateral: number;
    roadY: number;
  };
}

interface TrackBlueprint {
  id: TrackId;
  name: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Expert';
  subtitle: string;
  roadHalfWidth: number;
  accentHex: string;
  controlPoints: TrackControlPoint[];
  checkpointFractions: number[]; // values in (0, 1)
  seed: number;
  mountainScale: number;
  bridgeHeightThreshold: number;
}

const TRACK_BLUEPRINTS: Record<TrackId, TrackBlueprint> = {
  'pine-ridge': {
    id: 'pine-ridge',
    name: 'Pine Ridge Circuit',
    difficulty: 'Beginner',
    subtitle: 'Flowing valley sweepers through sunlit timberland',
    roadHalfWidth: 9.2,
    accentHex: '#10B981',
    seed: 104729,
    mountainScale: 1.0,
    bridgeHeightThreshold: 7.5,
    checkpointFractions: [0.17, 0.34, 0.52, 0.70, 0.86],
    controlPoints: [
      { pos: [0, 0, 122], bank: 0 },
      { pos: [74, 0, 122], bank: 0.04 },
      { pos: [138, 6, 86], bank: 0.14 },
      { pos: [148, 13, 14], bank: 0.12 },
      { pos: [112, 17, -56], bank: 0.14 },
      { pos: [46, 15, -108], bank: 0.08 },
      { pos: [-26, 10, -84], bank: -0.09 },
      { pos: [-96, 13, -112], bank: 0.14 },
      { pos: [-152, 9, -56], bank: 0.16 },
      { pos: [-144, 4, 24], bank: 0.12 },
      { pos: [-106, 2, 92], bank: 0.11 },
      { pos: [-58, 0, 122], bank: 0 },
    ],
  },
  'switchback-pass': {
    id: 'switchback-pass',
    name: 'Switchback Pass',
    difficulty: 'Intermediate',
    subtitle: 'Tight canyon hairpins and a high timber gorge bridge',
    roadHalfWidth: 8.1,
    accentHex: '#F59E0B',
    seed: 229931,
    mountainScale: 1.25,
    bridgeHeightThreshold: 9.0,
    checkpointFractions: [0.15, 0.30, 0.45, 0.60, 0.75, 0.89],
    controlPoints: [
      { pos: [0, 0, 148], bank: 0 },
      { pos: [92, 2, 148], bank: 0.05 },
      { pos: [172, 11, 114], bank: 0.18 },
      { pos: [184, 22, 34], bank: 0.2 },
      { pos: [112, 28, -8], bank: -0.19 }, // tight switchback hairpin 1
      { pos: [166, 33, -84], bank: 0.2 }, // sweeping outer hairpin
      { pos: [92, 38, -158], bank: 0.15 },
      { pos: [-16, 38, -162], bank: 0.02 }, // high gorge bridge
      { pos: [-118, 29, -134], bank: 0.18 },
      { pos: [-180, 18, -62], bank: 0.2 },
      { pos: [-112, 14, -4], bank: -0.18 }, // technical S-switchback
      { pos: [-170, 8, 66], bank: 0.2 }, // tight lower hairpin
      { pos: [-118, 2, 134], bank: 0.13 },
      { pos: [-66, 0, 148], bank: 0 },
    ],
  },
  'skyway-summit': {
    id: 'skyway-summit',
    name: 'Skyway Summit',
    difficulty: 'Expert',
    subtitle: 'Narrow summit crest jump, rapid chicanes, and steep canyon hairpins',
    roadHalfWidth: 7.2,
    accentHex: '#EF4444',
    seed: 481516,
    mountainScale: 1.45,
    bridgeHeightThreshold: 10.0,
    checkpointFractions: [0.13, 0.25, 0.39, 0.52, 0.65, 0.78, 0.90],
    controlPoints: [
      { pos: [0, 0, 168], bank: 0 },
      { pos: [104, 2, 168], bank: 0.04 },
      { pos: [192, 15, 134], bank: 0.2 },
      { pos: [212, 32, 42], bank: 0.21 },
      { pos: [158, 48, -32], bank: 0.12 }, // high-speed summit crest launch
      { pos: [102, 29, -112], bank: 0.15 }, // steep downhill plunge landing
      { pos: [28, 22, -74], bank: -0.19 }, // rapid valley chicane left
      { pos: [-44, 27, -142], bank: 0.19 }, // rapid chicane right
      { pos: [-138, 36, -162], bank: 0.16 },
      { pos: [-210, 24, -92], bank: 0.21 },
      { pos: [-194, 14, 0], bank: 0.17 },
      { pos: [-126, 10, 48], bank: -0.19 }, // tight canyon pinch right
      { pos: [-176, 6, 122], bank: 0.21 }, // tight final drift hairpin
      { pos: [-96, 2, 162], bank: 0.12 },
      { pos: [-54, 0, 168], bank: 0 },
    ],
  },
};

const TRACK_IDS: TrackId[] = ['pine-ridge', 'switchback-pass', 'skyway-summit'];

function hash2D(ix: number, iz: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function valueNoise2D(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2D(ix, iz, seed);
  const b = hash2D(ix + 1, iz, seed);
  const c = hash2D(ix, iz + 1, seed);
  const d = hash2D(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm2D(x: number, z: number, seed: number): number {
  let sum = 0;
  let amp = 0.55;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    sum += amp * (valueNoise2D(x * freq, z * freq, seed + i * 97) * 2 - 1);
    freq *= 2.05;
    amp *= 0.48;
  }
  return sum;
}

function interpolateBank(points: TrackControlPoint[], t: number): number {
  const n = points.length;
  const scaled = (((t % 1) + 1) % 1) * n;
  const i0 = Math.floor(scaled) % n;
  const i1 = (i0 + 1) % n;
  const f = scaled - Math.floor(scaled);
  const smooth = f * f * (3 - 2 * f);
  return points[i0].bank * (1 - smooth) + points[i1].bank * smooth;
}

function computeTrackOutline(
  samples: TrackSample[],
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
): TrackOutline {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxZ - bounds.minZ);
  const padX = 10;
  const padY = 8;
  const viewW = 100 - padX * 2;
  const viewH = 64 - padY * 2;
  const scale = Math.min(viewW / width, viewH / height);
  const offsetX = padX + (viewW - width * scale) * 0.5;
  const offsetY = padY + (viewH - height * scale) * 0.5;

  const project = (x: number, z: number): [number, number] => [
    Math.round((offsetX + (x - bounds.minX) * scale) * 10) / 10,
    Math.round((offsetY + (z - bounds.minZ) * scale) * 10) / 10,
  ];

  const outlineCount = 72;
  const points: Array<[number, number]> = [];
  for (let i = 0; i < outlineCount; i++) {
    const idx = Math.floor((i / outlineCount) * samples.length) % samples.length;
    const p = samples[idx].position;
    points.push(project(p.x, p.z));
  }

  const startSample = samples[0];
  const startPoint = project(startSample.position.x, startSample.position.z);
  const tLen = Math.hypot(startSample.tangent.x, startSample.tangent.z) || 1;
  const forwardTangent: [number, number] = [
    startSample.tangent.x / tLen,
    startSample.tangent.z / tLen,
  ];

  return { points, startPoint, forwardTangent };
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);

const trackCache = new Map<string, BuiltTrackData>();

export function buildTrackData(
  trackId: TrackId,
  direction: TrackDirection = 'forward'
): BuiltTrackData {
  const cacheKey = `${trackId}:${direction}`;
  const cached = trackCache.get(cacheKey);
  if (cached) return cached;

  const bp = TRACK_BLUEPRINTS[trackId];
  const vecPoints = bp.controlPoints.map((cp) => new THREE.Vector3(cp.pos[0], cp.pos[1], cp.pos[2]));
  const curve = new THREE.CatmullRomCurve3(vecPoints, true, 'centripetal', 0.5);
  curve.arcLengthDivisions = 1200;
  const totalLength = curve.getLength();

  const sampleCount = 600;
  const forwardSamples: TrackSample[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleCount;
    const position = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const flatRight = new THREE.Vector3().crossVectors(tangent, WORLD_UP).normalize();
    const flatUp = new THREE.Vector3().crossVectors(flatRight, tangent).normalize();

    const bank = interpolateBank(bp.controlPoints, t);
    const cosB = Math.cos(bank);
    const sinB = Math.sin(bank);
    const right = flatRight.clone().multiplyScalar(cosB).addScaledVector(flatUp, sinB).normalize();
    const up = new THREE.Vector3().crossVectors(right, tangent).normalize();

    if (position.x < minX) minX = position.x;
    if (position.x > maxX) maxX = position.x;
    if (position.z < minZ) minZ = position.z;
    if (position.z > maxZ) maxZ = position.z;

    forwardSamples.push({
      t,
      distance: t * totalLength,
      position,
      tangent,
      right,
      up,
      bank,
      curvature: 0,
    });
  }

  // Reorder and invert frames cleanly when running in Reverse mode (index 0 stays at Start/Finish)
  const samples: TrackSample[] =
    direction === 'forward'
      ? forwardSamples
      : forwardSamples.map((_, i) => {
          const srcIdx = (sampleCount - i) % sampleCount;
          const src = forwardSamples[srcIdx];
          const t = i / sampleCount;
          return {
            t,
            distance: t * totalLength,
            position: src.position.clone(),
            tangent: src.tangent.clone().negate(),
            right: src.right.clone().negate(),
            up: src.up.clone(),
            bank: -src.bank,
            curvature: 0,
          };
        });

  // Compute curvature for roadside apex delineators
  for (let i = 0; i < sampleCount; i++) {
    const prev = samples[(i - 1 + sampleCount) % sampleCount];
    const next = samples[(i + 1) % sampleCount];
    const dTan = new THREE.Vector3().subVectors(next.tangent, prev.tangent);
    samples[i].curvature = dTan.dot(samples[i].right);
  }

  const roadHalfWidth = bp.roadHalfWidth;

  // Spatial 2D distance query against sampled track centerline
  const distanceToRoad2D = (x: number, z: number) => {
    let bestIdx = 0;
    let bestDistSq = Infinity;
    for (let i = 0; i < sampleCount; i += 6) {
      const p = samples[i].position;
      const dx = x - p.x;
      const dz = z - p.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }
    const coarseCenter = bestIdx;
    for (let offset = -6; offset <= 6; offset++) {
      const idx = (coarseCenter + offset + sampleCount) % sampleCount;
      const p = samples[idx].position;
      const dx = x - p.x;
      const dz = z - p.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = idx;
      }
    }
    const s = samples[bestIdx];
    const dx = x - s.position.x;
    const dz = z - s.position.z;
    const lateral = dx * s.right.x + dz * s.right.z;
    const roadY = s.position.y + lateral * Math.tan(s.bank);
    return { distSq: bestDistSq, sampleIndex: bestIdx, lateral, roadY };
  };

  // Procedural Alpine Canyon heightfield that cradles the road corridor cleanly
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const trackRadius = Math.max(maxX - minX, maxZ - minZ) * 0.55;

  const terrainHeightAt = (x: number, z: number): number => {
    const q = distanceToRoad2D(x, z);
    const dist = Math.sqrt(q.distSq);

    const macroNoise = fbm2D(x * 0.0042, z * 0.0042, bp.seed);
    const ridgeNoise = 1 - Math.abs(fbm2D(x * 0.0075 + 17.3, z * 0.0075 - 9.1, bp.seed + 503));
    const detailNoise = fbm2D(x * 0.022, z * 0.022, bp.seed + 911);

    const radialDist = Math.hypot(x - centerX, z - centerZ);
    const rimFactor = THREE.MathUtils.smoothstep(radialDist, trackRadius * 0.92, trackRadius * 2.15);

    const baseValley =
      macroNoise * 16 * bp.mountainScale +
      detailNoise * 3.2 -
      4.5 +
      rimFactor * (48 + ridgeNoise * 78) * bp.mountainScale;

    const s = samples[q.sampleIndex];
    const isGorge = s.position.y > bp.bridgeHeightThreshold + 12;
    const roadTargetY = isGorge ? s.position.y - 11.5 : s.position.y - 0.85;

    const innerEdge = roadHalfWidth + 4.5;
    const outerEdge = roadHalfWidth + 40;
    const blend = THREE.MathUtils.smoothstep(dist, innerEdge, outerEdge);

    const blended = roadTargetY * (1 - blend) + baseValley * blend;
    if (dist < roadHalfWidth + 3.2) {
      return Math.min(blended, q.roadY - 0.65);
    }
    return blended;
  };

  // Build Start/Finish gate (index 0) and sequential checkpoints (1..N)
  const cpFractions =
    direction === 'forward'
      ? bp.checkpointFractions
      : [...bp.checkpointFractions].reverse().map((f) => 1 - f);

  const checkpoints: CheckpointGate[] = [];
  const allFractions = [0, ...cpFractions];
  allFractions.forEach((frac, idx) => {
    const sampleIdx = Math.round((((frac % 1) + 1) % 1) * sampleCount) % sampleCount;
    const s = samples[sampleIdx];
    checkpoints.push({
      index: idx,
      t: s.t,
      distance: s.distance,
      position: s.position.clone(),
      tangent: s.tangent.clone(),
      right: s.right.clone(),
      up: s.up.clone(),
      halfWidth: roadHalfWidth,
    });
  });

  const bounds = { minX, maxX, minZ, maxZ };
  const outline = computeTrackOutline(samples, bounds);

  const built: BuiltTrackData = {
    summary: {
      id: bp.id,
      name: bp.name,
      difficulty: bp.difficulty,
      subtitle: bp.subtitle,
      lengthMeters: Math.round(totalLength),
      checkpointCount: bp.checkpointFractions.length,
      roadHalfWidth,
      accentHex: bp.accentHex,
      outline,
    },
    direction,
    curve,
    samples,
    totalLength,
    roadHalfWidth,
    checkpoints,
    bounds,
    seed: bp.seed,
    terrainHeightAt,
    distanceToRoad2D,
  };

  trackCache.set(cacheKey, built);
  return built;
}

/** Real spline-derived track summaries (no hard-coded lengths) */
export const TRACK_LIST: TrackSummary[] = TRACK_IDS.map((id) => buildTrackData(id, 'forward').summary);

export function getTrackList(direction: TrackDirection): TrackSummary[] {
  return TRACK_IDS.map((id) => buildTrackData(id, direction).summary);
}

/**
 * Fixed-window nearest sample lookup starting from hintIndex.
 * Keeps `hint` immutable as the search window centre so it matches brute-force 100% of ticks.
 */
export function findNearestTrackSample(
  track: BuiltTrackData,
  x: number,
  z: number,
  hintIndex: number
): { sampleIndex: number; t: number; lateral: number; distSq: number } {
  const samples = track.samples;
  const n = samples.length;
  const hint = ((hintIndex % n) + n) % n;
  let bestIdx = hint;
  let bestDistSq = Infinity;

  // Local search window strictly centred on `hint` (±28 samples covers ~60-85m)
  for (let offset = -28; offset <= 28; offset++) {
    const idx = (hint + offset + n) % n;
    const p = samples[idx].position;
    const dx = x - p.x;
    const dz = z - p.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestIdx = idx;
    }
  }

  // Fallback global search if vehicle teleported or strayed far from hint
  if (bestDistSq > 900) {
    for (let i = 0; i < n; i += 4) {
      const p = samples[i].position;
      const dx = x - p.x;
      const dz = z - p.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }
    const base = bestIdx;
    for (let offset = -4; offset <= 4; offset++) {
      const idx = (base + offset + n) % n;
      const p = samples[idx].position;
      const dx = x - p.x;
      const dz = z - p.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = idx;
      }
    }
  }

  const s = samples[bestIdx];
  const dx = x - s.position.x;
  const dz = z - s.position.z;
  const lateral = dx * s.right.x + dz * s.right.z;

  const along = dx * s.tangent.x + dz * s.tangent.z;
  const segLen = track.totalLength / n;
  let t = s.t + along / (segLen * n);
  t = ((t % 1) + 1) % 1;

  return { sampleIndex: bestIdx, t, lateral, distSq: bestDistSq };
}

/**
 * Continuously interpolates road position, tangent, right, up, bank, lateral offset, and roadY
 * between the two neighbouring spline samples bracketing (x, z).
 * Eliminates discrete sample height stepping on hills (< 0.05m per-tick height delta).
 */
export function sampleInterpolatedRoadFrame(
  track: BuiltTrackData,
  x: number,
  z: number,
  hintIndex: number,
  out: InterpolatedRoadFrame
): InterpolatedRoadFrame {
  const nearest = findNearestTrackSample(track, x, z, hintIndex);
  const samples = track.samples;
  const n = samples.length;
  const i0 = nearest.sampleIndex;
  const s0 = samples[i0];

  // Signed distance along s0's smooth XZ tangent plane chooses the exact bracketing segment
  // with zero exterior-angle clamping stall on tight banked curves.
  const d0 = (x - s0.position.x) * s0.tangent.x + (z - s0.position.z) * s0.tangent.z;
  let segStartIdx: number;
  let segEndIdx: number;
  let dStart: number;
  let dEnd: number;

  if (d0 >= 0) {
    segStartIdx = i0;
    segEndIdx = (i0 + 1) % n;
    const sEnd = samples[segEndIdx];
    dStart = d0;
    dEnd = (x - sEnd.position.x) * sEnd.tangent.x + (z - sEnd.position.z) * sEnd.tangent.z;
    // If vehicle is slightly past sEnd's plane too (on inside of a sharp bend), step forward 1 segment
    if (dEnd > 0) {
      segStartIdx = segEndIdx;
      segEndIdx = (segEndIdx + 1) % n;
      const sEnd2 = samples[segEndIdx];
      dStart = dEnd;
      dEnd = (x - sEnd2.position.x) * sEnd2.tangent.x + (z - sEnd2.position.z) * sEnd2.tangent.z;
    }
  } else {
    segEndIdx = i0;
    segStartIdx = (i0 - 1 + n) % n;
    const sStart = samples[segStartIdx];
    dStart = (x - sStart.position.x) * sStart.tangent.x + (z - sStart.position.z) * sStart.tangent.z;
    dEnd = d0;
    // If vehicle is slightly behind sStart's plane too, step backward 1 segment
    if (dStart < 0) {
      segEndIdx = segStartIdx;
      segStartIdx = (segStartIdx - 1 + n) % n;
      const sStart2 = samples[segStartIdx];
      dEnd = dStart;
      dStart = (x - sStart2.position.x) * sStart2.tangent.x + (z - sStart2.position.z) * sStart2.tangent.z;
    }
  }

  const sStart = samples[segStartIdx];
  const sEnd = samples[segEndIdx];
  const denom = dStart - dEnd;
  const alpha = denom > 1e-6 ? THREE.MathUtils.clamp(dStart / denom, 0, 1) : 0;

  out.sampleIndex = i0;
  out.distSq = nearest.distSq;

  out.position.lerpVectors(sStart.position, sEnd.position, alpha);
  out.tangent.lerpVectors(sStart.tangent, sEnd.tangent, alpha).normalize();
  out.right.lerpVectors(sStart.right, sEnd.right, alpha).normalize();
  out.up.crossVectors(out.right, out.tangent).normalize();
  out.bank = sStart.bank + (sEnd.bank - sStart.bank) * alpha;

  const dx = x - out.position.x;
  const dz = z - out.position.z;
  out.lateral = dx * out.right.x + dz * out.right.z;
  out.roadY = out.position.y + out.lateral * Math.tan(out.bank);

  out.t = (((segStartIdx + alpha) / n) % 1 + 1) % 1;

  return out;
}
