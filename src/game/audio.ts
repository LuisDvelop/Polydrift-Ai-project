import { VehicleId } from './types';

/**
 * 100% Procedural Web Audio API synthesizer for Apex Ridge.
 * Synthesizes car engine / hovercraft turbine harmonics, drift tire screech / airbrake hiss,
 * boost release surge, countdown tones, checkpoint chimes, and PB fanfare with zero external files.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Continuous vehicle engine nodes
  private oscPrimary: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  // Continuous drift noise nodes
  private driftNoiseSrc: AudioBufferSourceNode | null = null;
  private driftFilter: BiquadFilterNode | null = null;
  private driftGain: GainNode | null = null;

  private vehicleId: VehicleId = 'drift-car';
  private muted = false;
  private initialized = false;

  public unlock(): void {
    if (!this.initialized) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      try {
        const ctx = new AudioCtx();
        this.ctx = ctx;

        const master = ctx.createGain();
        master.gain.value = this.muted ? 0 : 0.34;
        master.connect(ctx.destination);
        this.masterGain = master;

        // Engine synthesizer chain
        const engineFilter = ctx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 420;
        engineFilter.Q.value = 3.2;

        const engineGain = ctx.createGain();
        engineGain.gain.value = 0.0001;

        const osc1 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.value = 72;

        const osc2 = ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.value = 36;

        osc1.connect(engineFilter);
        osc2.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineGain.connect(master);

        osc1.start();
        osc2.start();

        this.oscPrimary = osc1;
        this.oscSub = osc2;
        this.engineFilter = engineFilter;
        this.engineGain = engineGain;

        // Drift / airbrake noise chain
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = noiseBuffer;
        noiseSrc.loop = true;

        const driftFilter = ctx.createBiquadFilter();
        driftFilter.type = 'bandpass';
        driftFilter.frequency.value = 1400;
        driftFilter.Q.value = 4.5;

        const driftGain = ctx.createGain();
        driftGain.gain.value = 0.0001;

        noiseSrc.connect(driftFilter);
        driftFilter.connect(driftGain);
        driftGain.connect(master);
        noiseSrc.start();

        this.driftNoiseSrc = noiseSrc;
        this.driftFilter = driftFilter;
        this.driftGain = driftGain;

        this.initialized = true;
        this.applyVehicleTimbre();
      } catch {
        // AudioContext blocked or unsupported
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setVehicle(vehicleId: VehicleId): void {
    this.vehicleId = vehicleId;
    this.applyVehicleTimbre();
  }

  private applyVehicleTimbre(): void {
    if (!this.oscPrimary || !this.oscSub || !this.engineFilter || !this.driftFilter) return;
    if (this.vehicleId === 'hovercraft') {
      this.oscPrimary.type = 'triangle';
      this.oscSub.type = 'sine';
      this.engineFilter.type = 'bandpass';
      this.engineFilter.Q.value = 2.4;
      this.driftFilter.Q.value = 2.2;
    } else {
      this.oscPrimary.type = 'sawtooth';
      this.oscSub.type = 'triangle';
      this.engineFilter.type = 'lowpass';
      this.engineFilter.Q.value = 3.2;
      this.driftFilter.Q.value = 5.2;
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.34, now, 0.03);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public updateContinuous(params: {
    active: boolean;
    speedRatio: number; // 0..1.3
    driftIntensity: number; // 0..1
    isBoosting: boolean;
  }): void {
    if (!this.ctx || !this.oscPrimary || !this.oscSub || !this.engineFilter || !this.engineGain || !this.driftGain || !this.driftFilter) {
      return;
    }
    const now = this.ctx.currentTime;
    const clampedSpeed = Math.max(0, Math.min(1.4, params.speedRatio));

    if (!params.active) {
      this.engineGain.gain.setTargetAtTime(0.0001, now, 0.08);
      this.driftGain.gain.setTargetAtTime(0.0001, now, 0.06);
      return;
    }

    if (this.vehicleId === 'hovercraft') {
      // Smooth harmonic anti-gravity turbine hum
      const baseFreq = 115 + clampedSpeed * 260 + (params.isBoosting ? 75 : 0);
      this.oscPrimary.frequency.setTargetAtTime(baseFreq, now, 0.05);
      this.oscSub.frequency.setTargetAtTime(baseFreq * 1.498, now, 0.05);
      this.engineFilter.frequency.setTargetAtTime(340 + clampedSpeed * 1250, now, 0.05);
      this.engineGain.gain.setTargetAtTime(0.14 + clampedSpeed * 0.14, now, 0.06);

      // Aerodynamic airbrake whoosh
      const targetDrift = params.driftIntensity * 0.18;
      this.driftFilter.frequency.setTargetAtTime(680 + clampedSpeed * 950, now, 0.05);
      this.driftGain.gain.setTargetAtTime(Math.max(0.0001, targetDrift), now, 0.05);
    } else {
      // Multi-gear feel arcade GT car engine
      const gearSpeed = (clampedSpeed * 3.2) % 1;
      const rpm = 0.25 + clampedSpeed * 0.55 + gearSpeed * 0.28;
      const baseFreq = 62 + rpm * 155 + (params.isBoosting ? 42 : 0);
      this.oscPrimary.frequency.setTargetAtTime(baseFreq, now, 0.04);
      this.oscSub.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.04);
      this.engineFilter.frequency.setTargetAtTime(280 + rpm * 1100 + (params.isBoosting ? 500 : 0), now, 0.05);
      this.engineGain.gain.setTargetAtTime(0.11 + clampedSpeed * 0.13, now, 0.05);

      // Tire screech bandpass noise
      const targetDrift = params.driftIntensity * 0.15;
      this.driftFilter.frequency.setTargetAtTime(1450 + params.driftIntensity * 650, now, 0.04);
      this.driftGain.gain.setTargetAtTime(Math.max(0.0001, targetDrift), now, 0.04);
    }
  }

  public playCountdownBeep(isGo: boolean): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isGo ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isGo ? 880 : 440, now);
    if (isGo) {
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.14);
    }
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(isGo ? 0.42 : 0.28, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isGo ? 0.36 : 0.19));

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  public playCheckpointChime(checkpointIndex: number, isAhead: boolean | null): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    // Ascending pentatonic scale per checkpoint
    const baseScale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];
    const rootFreq = baseScale[(checkpointIndex - 1) % baseScale.length];
    const notes = isAhead === false ? [rootFreq, rootFreq * 1.189] : [rootFreq, rootFreq * 1.25, rootFreq * 1.5];

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const t = now + idx * 0.055;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.24, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  public playBoostSurge(tier: number): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    const startFreq = 160 + tier * 55;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 2.4, now + 0.26);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.frequency.exponentialRampToValueAtTime(420, now + 0.35);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22 + tier * 0.05, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  public playWallBump(intensity: number): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(125, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.14);

    const vol = Math.min(0.32, 0.1 + intensity * 0.22);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  public playFinishFanfare(isNewBest: boolean): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = isNewBest
      ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
      : [440, 554.37, 659.25, 880];

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const t = now + idx * 0.085;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.26, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  }

  public dispose(): void {
    try {
      this.oscPrimary?.stop();
      this.oscSub?.stop();
      this.driftNoiseSrc?.stop();
      this.ctx?.close();
    } catch {
      // Ignore cleanup errors
    }
    this.ctx = null;
    this.initialized = false;
  }
}
