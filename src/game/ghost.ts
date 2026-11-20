import { GhostFrame, GhostRecord, TrackDirection, TrackId, VehicleId } from './types';

const STORAGE_PREFIX = 'apex-ridge:pb:v1:';
const RECORD_INTERVAL_SEC = 1 / 30; // 30 Hz compact sampling

export function getGhostStorageKey(
  trackId: TrackId,
  vehicleId: VehicleId,
  direction: TrackDirection = 'forward'
): string {
  // Preserve original key format for forward runs so existing personal bests stay intact
  if (direction === 'forward') {
    return `${STORAGE_PREFIX}${trackId}:${vehicleId}`;
  }
  return `${STORAGE_PREFIX}${trackId}:reverse:${vehicleId}`;
}

export function loadGhostRecord(
  trackId: TrackId,
  vehicleId: VehicleId,
  direction: TrackDirection = 'forward'
): GhostRecord | null {
  try {
    const raw = window.localStorage.getItem(getGhostStorageKey(trackId, vehicleId, direction));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GhostRecord;
    if (
      !parsed ||
      typeof parsed.bestLapMs !== 'number' ||
      !Array.isArray(parsed.frames) ||
      parsed.frames.length < 2
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveGhostRecord(record: GhostRecord): void {
  try {
    const dir: TrackDirection = record.direction ?? 'forward';
    window.localStorage.setItem(
      getGhostStorageKey(record.trackId, record.vehicleId, dir),
      JSON.stringify(record)
    );
  } catch {
    // Storage quota exceeded or unavailable; ignore gracefully
  }
}

export function loadAllPersonalBests(): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  const tracks: TrackId[] = ['pine-ridge', 'switchback-pass', 'skyway-summit'];
  const directions: TrackDirection[] = ['forward', 'reverse'];
  const vehicles: VehicleId[] = ['drift-car', 'hovercraft'];
  for (const t of tracks) {
    for (const d of directions) {
      for (const v of vehicles) {
        const rec = loadGhostRecord(t, v, d);
        result[`${t}:${d}:${v}`] = rec ? rec.bestLapMs : null;
      }
    }
  }
  return result;
}

export interface SampledGhostPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  drifting: boolean;
  boosting: boolean;
  speed: number;
  trackT: number;
  finished: boolean;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export class GhostRecorder {
  private frames: GhostFrame[] = [];
  private nextSampleTime = 0;

  public reset(): void {
    this.frames = [];
    this.nextSampleTime = 0;
  }

  public record(
    timeSec: number,
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number,
    roll: number,
    drifting: boolean,
    boosting: boolean,
    trackT: number,
    speed: number,
    force = false
  ): void {
    if (!force && timeSec < this.nextSampleTime) return;
    this.nextSampleTime = timeSec + RECORD_INTERVAL_SEC;
    const flags = (drifting ? 1 : 0) | (boosting ? 2 : 0);
    this.frames.push([
      Math.round(timeSec * 1000) / 1000,
      Math.round(x * 100) / 100,
      Math.round(y * 100) / 100,
      Math.round(z * 100) / 100,
      Math.round(yaw * 1000) / 1000,
      Math.round(pitch * 1000) / 1000,
      Math.round(roll * 1000) / 1000,
      flags,
      Math.round(trackT * 10000) / 10000,
      Math.round(speed * 100) / 100,
    ]);
  }

  public getFrames(): GhostFrame[] {
    return this.frames;
  }
}

export class GhostPlayer {
  private record: GhostRecord | null = null;
  private cursor = 0;
  /** Monotonic unwrapped progress per frame [0..1+] for O(log N) / cursor time-at-progress lookup */
  private unwrappedT: number[] = [];
  private progressCursor = 0;

  public setRecord(record: GhostRecord | null): void {
    this.record = record;
    this.cursor = 0;
    this.progressCursor = 0;
    this.unwrappedT = [];

    if (!record || record.frames.length < 2) return;
    const frames = record.frames;
    // Build monotonic progress array when trackT is present (9th tuple slot)
    if (typeof frames[0][8] === 'number') {
      let prevRaw = frames[0][8]!;
      // Starting grid sits ~5.5m behind start line (raw ~0.994), unwrap start to <= 0
      let accum = prevRaw > 0.5 ? prevRaw - 1 : prevRaw;
      this.unwrappedT.push(accum);
      for (let i = 1; i < frames.length; i++) {
        const raw = typeof frames[i][8] === 'number' ? frames[i][8]! : prevRaw;
        let delta = raw - prevRaw;
        if (delta < -0.5) delta += 1;
        else if (delta > 0.5) delta -= 1;
        accum += delta;
        prevRaw = raw;
        this.unwrappedT.push(accum);
      }
    }
  }

  public getRecord(): GhostRecord | null {
    return this.record;
  }

  public hasTrackProgressData(): boolean {
    return this.unwrappedT.length >= 2;
  }

  public reset(): void {
    this.cursor = 0;
    this.progressCursor = 0;
  }

  public sampleAt(timeSec: number, out: SampledGhostPose): boolean {
    const rec = this.record;
    if (!rec || rec.frames.length < 2) return false;
    const frames = rec.frames;
    const lastIdx = frames.length - 1;

    if (timeSec <= frames[0][0]) {
      const f = frames[0];
      out.x = f[1];
      out.y = f[2];
      out.z = f[3];
      out.yaw = f[4];
      out.pitch = f[5];
      out.roll = f[6];
      out.drifting = (f[7] & 1) !== 0;
      out.boosting = (f[7] & 2) !== 0;
      out.trackT = typeof f[8] === 'number' ? f[8] : 0;
      out.speed = typeof f[9] === 'number' ? f[9] : 0;
      out.finished = false;
      return true;
    }

    if (timeSec >= frames[lastIdx][0]) {
      const f = frames[lastIdx];
      out.x = f[1];
      out.y = f[2];
      out.z = f[3];
      out.yaw = f[4];
      out.pitch = f[5];
      out.roll = f[6];
      out.drifting = false;
      out.boosting = false;
      out.trackT = typeof f[8] === 'number' ? f[8] : 1;
      out.speed = typeof f[9] === 'number' ? f[9] : 0;
      out.finished = true;
      return true;
    }

    if (this.cursor > lastIdx - 1 || frames[this.cursor][0] > timeSec) {
      this.cursor = 0;
    }
    while (this.cursor < lastIdx - 1 && frames[this.cursor + 1][0] < timeSec) {
      this.cursor++;
    }

    const a = frames[this.cursor];
    const b = frames[this.cursor + 1];
    const span = Math.max(0.0001, b[0] - a[0]);
    const alpha = Math.max(0, Math.min(1, (timeSec - a[0]) / span));

    out.x = a[1] + (b[1] - a[1]) * alpha;
    out.y = a[2] + (b[2] - a[2]) * alpha;
    out.z = a[3] + (b[3] - a[3]) * alpha;
    out.yaw = lerpAngle(a[4], b[4], alpha);
    out.pitch = lerpAngle(a[5], b[5], alpha);
    out.roll = lerpAngle(a[6], b[6], alpha);
    out.drifting = (a[7] & 1) !== 0;
    out.boosting = (a[7] & 2) !== 0;

    const ta = typeof a[8] === 'number' ? a[8] : 0;
    const tb = typeof b[8] === 'number' ? b[8] : ta;
    let tDiff = tb - ta;
    if (tDiff < -0.5) tDiff += 1;
    else if (tDiff > 0.5) tDiff -= 1;
    out.trackT = (((ta + tDiff * alpha) % 1) + 1) % 1;

    // Derive speed from recorded speed slot, or fall back to frame-to-frame distance/dt for legacy ghosts
    if (typeof a[9] === 'number' && typeof b[9] === 'number') {
      out.speed = a[9] + (b[9] - a[9]) * alpha;
    } else {
      const dist = Math.hypot(b[1] - a[1], b[2] - a[2], b[3] - a[3]);
      out.speed = dist / span;
    }

    out.finished = false;
    return true;
  }

  /**
   * Returns the exact recorded ghost timestamp (in seconds) when the ghost reached
   * the given unwrapped lap progress `playerProgress` (in [0, 1]).
   */
  public findTimeAtProgress(playerProgress: number): number | null {
    const rec = this.record;
    if (!rec || this.unwrappedT.length < 2) return null;
    const frames = rec.frames;
    const u = this.unwrappedT;
    const lastIdx = u.length - 1;

    if (playerProgress <= u[0]) return frames[0][0];
    if (playerProgress >= u[lastIdx]) return frames[lastIdx][0];

    // Advance or rewind monotonic progress cursor
    if (this.progressCursor > lastIdx - 1 || u[this.progressCursor] > playerProgress) {
      this.progressCursor = 0;
    }
    while (this.progressCursor < lastIdx - 1 && u[this.progressCursor + 1] < playerProgress) {
      this.progressCursor++;
    }

    const t0 = u[this.progressCursor];
    const t1 = u[this.progressCursor + 1];
    const span = t1 - t0;
    const frac = span > 1e-6 ? Math.max(0, Math.min(1, (playerProgress - t0) / span)) : 0;
    return frames[this.progressCursor][0] + (frames[this.progressCursor + 1][0] - frames[this.progressCursor][0]) * frac;
  }
}
