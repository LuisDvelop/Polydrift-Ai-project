export type TrackId = 'pine-ridge' | 'switchback-pass' | 'skyway-summit';

export type TrackDirection = 'forward' | 'reverse';

export type VehicleId = 'drift-car' | 'hovercraft';

export type CameraMode = 'chase' | 'far' | 'hood';

export type RacePhase = 'menu' | 'countdown' | 'racing' | 'finished';

export interface TrackOutline {
  points: Array<[number, number]>;
  startPoint: [number, number];
  forwardTangent: [number, number];
}

export interface TrackSummary {
  id: TrackId;
  name: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Expert';
  subtitle: string;
  lengthMeters: number;
  checkpointCount: number;
  roadHalfWidth: number;
  accentHex: string;
  outline: TrackOutline;
}

export interface VehicleSpec {
  id: VehicleId;
  name: string;
  category: string;
  tagline: string;
  topSpeedKmh: number;
  driftStyle: string;
  handlingLabel: string;
  accentHex: string;
}

/**
 * Compact tuple for 30Hz ghost telemetry:
 * [timeSec, x, y, z, yaw, pitch, roll, flags, trackT?, speed?]
 * trackT and speed are optional for backward compatibility with older saved ghosts.
 */
export type GhostFrame = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number?,
  number?,
];

export interface GhostRecord {
  trackId: TrackId;
  direction?: TrackDirection;
  vehicleId: VehicleId;
  bestLapMs: number;
  checkpointSplitsMs: number[];
  recordedAt: number;
  frames: GhostFrame[];
}

export interface SplitNotification {
  checkpointIndex: number; // 1-based, or 0 for finish
  label: string;
  splitMs: number;
  deltaMs: number | null; // negative = faster than PB
  timestamp: number;
}

export interface FinishSummary {
  trackId: TrackId;
  direction: TrackDirection;
  vehicleId: VehicleId;
  lapTimeMs: number;
  previousBestMs: number | null;
  isNewBest: boolean;
  checkpointSplitsMs: number[];
  previousSplitsMs: number[] | null;
}

export interface HudSnapshot {
  phase: RacePhase;
  trackId: TrackId;
  direction: TrackDirection;
  vehicleId: VehicleId;
  cameraMode: CameraMode;
  ghostEnabled: boolean;
  hasGhost: boolean;
  muted: boolean;
  countdownValue: number; // 3, 2, 1, 0 (GO)
  elapsedMs: number;
  speedKmh: number;
  maxSpeedKmh: number;
  driftCharge: number; // 0..1
  driftTier: 0 | 1 | 2 | 3;
  isDrifting: boolean;
  isBoosting: boolean;
  checkpointsPassed: number;
  totalCheckpoints: number;
  liveGhostDeltaMs: number | null;
  lastSplit: SplitNotification | null;
  bestLapMs: number | null;
  finishSummary: FinishSummary | null;
  offTrackWarning: boolean;
}

export interface TouchInputState {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  drift: boolean;
}

export const VEHICLE_SPECS: Record<VehicleId, VehicleSpec> = {
  'drift-car': {
    id: 'drift-car',
    name: 'Alpine Drift GT',
    category: 'Arcade Drift Car',
    tagline: 'Crisp snap-drift traction with 3-tier turbo boost exit.',
    topSpeedKmh: 245,
    driftStyle: 'Rear-Slip Turbo',
    handlingLabel: 'High Grip / Snap Drift',
    accentHex: '#F59E0B',
  },
  hovercraft: {
    id: 'hovercraft',
    name: 'Valkyrie AG-01',
    category: 'Anti-Gravity Craft',
    tagline: 'High-velocity hovering chassis with sharp airbrake banking.',
    topSpeedKmh: 285,
    driftStyle: 'Airbrake Pivot',
    handlingLabel: 'Fluid Glide / Fast Apex',
    accentHex: '#22D3EE',
  },
};

export function formatLapTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '--:--.---';
  const clamped = Math.max(0, Math.round(ms));
  const minutes = Math.floor(clamped / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  const millis = clamped % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export function formatDeltaMs(deltaMs: number): string {
  const sign = deltaMs <= 0 ? '-' : '+';
  const absSec = Math.abs(deltaMs) / 1000;
  return `${sign}${absSec.toFixed(2)}s`;
}
