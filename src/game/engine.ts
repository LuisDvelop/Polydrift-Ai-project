import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AudioEngine } from './audio';
import {
  GhostPlayer,
  GhostRecorder,
  SampledGhostPose,
  loadGhostRecord,
  saveGhostRecord,
} from './ghost';
import {
  VehicleInput,
  VehiclePhysicsState,
  createInitialPhysicsState,
  getVehicleMaxSpeedKmh,
  placeStateAtGate,
  stepVehiclePhysics,
} from './physics';
import { ProceduralTexturePack, createProceduralTexturePack } from './textures';
import { BuiltTrackData, buildTrackData, findNearestTrackSample } from './tracks';
import {
  CameraMode,
  FinishSummary,
  GhostRecord,
  HudSnapshot,
  RacePhase,
  SplitNotification,
  TouchInputState,
  TrackDirection,
  TrackId,
  VehicleId,
} from './types';
import { VehicleRig, createVehicleRig } from './vehicles';
import { BuiltWorldScene, buildAlpineWorld } from './worldBuilder';

// Pre-allocated scratch math helpers (zero GC inside render/tick loop)
const _vPos = new THREE.Vector3();
const _vTarget = new THREE.Vector3();
const _vFwd = new THREE.Vector3();
const _vRight = new THREE.Vector3();
const _vUp = new THREE.Vector3(0, 1, 0);
const _renderPos = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _sparkColor = new THREE.Color();
const _ghostPose: SampledGhostPose = {
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

interface SparkParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  colorHex: number;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function isInteractiveElementFocused(): boolean {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return false;
  const tag = el.tagName;
  if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
    return true;
  }
  return el.getAttribute('role') === 'button';
}

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export interface RaceEngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onRecordsChanged: () => void;
  onContextLost: (lost: boolean) => void;
}

export class RaceEngine {
  private container: HTMLElement;
  private callbacks: RaceEngineCallbacks;
  private isSoftwareGl: boolean;
  private prefersReducedMotion: boolean;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sunLight: THREE.DirectionalLight;
  private textures: ProceduralTexturePack;
  private audio: AudioEngine;

  private trackId: TrackId = 'pine-ridge';
  private direction: TrackDirection = 'forward';
  private vehicleId: VehicleId = 'drift-car';
  private cameraMode: CameraMode = 'chase';
  private ghostEnabled = true;

  private trackData: BuiltTrackData;
  private worldScene: BuiltWorldScene | null = null;
  private playerRig: VehicleRig | null = null;
  private ghostRig: VehicleRig | null = null;

  private physics: VehiclePhysicsState;
  private phase: RacePhase = 'menu';
  private countdownTimer = 0;
  private lastCountdownInt = 4;
  private elapsedSec = 0;
  private totalTimeSec = 0;

  // Checkpoints & Splits
  private checkpointsPassed = 0;
  private currentSplitsMs: number[] = [];
  private lastSplit: SplitNotification | null = null;
  private finishSummary: FinishSummary | null = null;

  // Ghost recording & PB playback
  private ghostRecorder = new GhostRecorder();
  private ghostPlayer = new GhostPlayer();
  private activeBestRecord: GhostRecord | null = null;
  private liveGhostDeltaMs: number | null = null;

  // Skid marks & drift sparks (InstancedMesh pools -> 2 draw calls, zero GC)
  private skidInst: THREE.InstancedMesh;
  private skidCursor = 0;
  private readonly skidMax = 280;
  private skidTimer = 0;

  private sparkInst: THREE.InstancedMesh;
  private sparks: SparkParticle[] = [];
  private readonly sparkMax = 110;
  private sparkCursor = 0;

  // Input state
  private keys = new Set<string>();
  private touchInput: TouchInputState = {
    throttle: false,
    brake: false,
    left: false,
    right: false,
    drift: false,
  };
  private inputObj: VehicleInput = { throttle: 0, brake: 0, steer: 0, drift: false };

  // Render-interpolated pose (smooth on 75Hz / 144Hz monitors)
  private renderYaw = 0;
  private renderPitch = 0;
  private renderRoll = 0;
  private renderDriftAngle = 0;

  // Camera state
  private camPos = new THREE.Vector3();
  private camLookAt = new THREE.Vector3();
  private camRoll = 0;
  private camInitialized = false;

  // Loop & timing
  private frameId = 0;
  private destroyed = false;
  private lastFrameMs = 0;
  private physicsAccumulator = 0;
  private readonly fixedStep = 1 / 120;
  private lastHudPushMs = 0;
  private wallSoundCooldown = 0;

  constructor(container: HTMLElement, callbacks: RaceEngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdbeefe);
    this.scene.fog = new THREE.Fog(0xdbeefe, 180, 760);

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(64, width / height, 0.25, 1300);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    // Mandatory studio PBR environment reflections (RoomEnvironment)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Warm alpine sunlight key light + cool sky/meadow hemisphere fill
    const hemi = new THREE.HemisphereLight(0x9bd3f8, 0x4b5c42, 0.72);
    hemi.position.set(0, 120, 0);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1d6, 2.25);
    sun.position.set(85, 115, 75);
    sun.castShadow = !this.isSoftwareGl;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 15;
    sun.shadow.camera.far = 320;
    const d = 68;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.025;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sunLight = sun;

    const rim = new THREE.DirectionalLight(0xb8dfff, 0.42);
    rim.position.set(-90, 45, -80);
    this.scene.add(rim);

    // Procedural texture pack & audio engine
    this.textures = createProceduralTexturePack(this.renderer.capabilities.getMaxAnisotropy());
    this.audio = new AudioEngine();

    // Pre-allocate instanced skid mark pool
    const skidGeo = new THREE.PlaneGeometry(0.38, 1.35);
    skidGeo.rotateX(-Math.PI / 2);
    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x111827,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.skidInst = new THREE.InstancedMesh(skidGeo, skidMat, this.skidMax);
    this.skidInst.frustumCulled = false;
    this.clearSkids();
    this.scene.add(this.skidInst);

    // Pre-allocate instanced drift spark particle pool
    const sparkGeo = new THREE.BoxGeometry(0.14, 0.14, 0.36);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sparkInst = new THREE.InstancedMesh(sparkGeo, sparkMat, this.sparkMax);
    this.sparkInst.frustumCulled = false;
    for (let i = 0; i < this.sparkMax; i++) {
      this.sparks.push({
        active: false,
        x: 0,
        y: -999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.35,
        colorHex: 0xf59e0b,
      });
    }
    this.clearSparks();
    this.scene.add(this.sparkInst);

    // Build initial track & vehicle
    this.trackData = buildTrackData(this.trackId, this.direction);
    this.physics = createInitialPhysicsState(this.trackData);
    this.rebuildWorld();
    this.rebuildVehicles();
    this.loadBestGhost();
    this.syncVehicleMeshToPhysics(0.016, 1);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Event listeners (including blur & visibilitychange to prevent stuck keys)
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost, false);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored, false);

    this.pushHudSnapshot(true);
    this.lastFrameMs = performance.now();
    this.tick();
  }

  private clearSkids(): void {
    _dummy.position.set(0, -500, 0);
    _dummy.scale.set(0, 0, 0);
    _dummy.updateMatrix();
    for (let i = 0; i < this.skidMax; i++) {
      this.skidInst.setMatrixAt(i, _dummy.matrix);
    }
    this.skidInst.instanceMatrix.needsUpdate = true;
    this.skidCursor = 0;
  }

  private clearSparks(): void {
    _dummy.position.set(0, -500, 0);
    _dummy.scale.set(0, 0, 0);
    _dummy.updateMatrix();
    for (let i = 0; i < this.sparkMax; i++) {
      this.sparks[i].active = false;
      this.sparkInst.setMatrixAt(i, _dummy.matrix);
    }
    this.sparkInst.instanceMatrix.needsUpdate = true;
  }

  private clearAllInputs(): void {
    this.keys.clear();
    this.touchInput.throttle = false;
    this.touchInput.brake = false;
    this.touchInput.left = false;
    this.touchInput.right = false;
    this.touchInput.drift = false;
  }

  private rebuildWorld(): void {
    if (this.worldScene) {
      this.scene.remove(this.worldScene.group);
      this.worldScene.dispose();
      this.worldScene = null;
    }
    this.trackData = buildTrackData(this.trackId, this.direction);
    this.worldScene = buildAlpineWorld(this.trackData, this.textures);
    this.scene.add(this.worldScene.group);
  }

  private rebuildVehicles(): void {
    if (this.playerRig) {
      this.scene.remove(this.playerRig.root);
      this.playerRig.dispose();
    }
    if (this.ghostRig) {
      this.scene.remove(this.ghostRig.root);
      this.ghostRig.dispose();
    }
    this.playerRig = createVehicleRig(this.vehicleId, this.textures.contactShadowMap, false);
    this.scene.add(this.playerRig.root);

    this.ghostRig = createVehicleRig(this.vehicleId, this.textures.contactShadowMap, true);
    this.ghostRig.root.visible = false;
    this.scene.add(this.ghostRig.root);

    this.audio.setVehicle(this.vehicleId);
  }

  private loadBestGhost(): void {
    this.activeBestRecord = loadGhostRecord(this.trackId, this.vehicleId, this.direction);
    this.ghostPlayer.setRecord(this.activeBestRecord);
  }

  // --- Public UI Actions ---

  public selectTrack(trackId: TrackId): void {
    if (this.trackId === trackId && this.phase === 'menu') return;
    this.trackId = trackId;
    this.rebuildWorld();
    this.loadBestGhost();
    this.resetToGrid('menu');
    this.camInitialized = false;
    this.pushHudSnapshot(true);
  }

  public selectDirection(direction: TrackDirection): void {
    if (this.direction === direction) return;
    this.direction = direction;
    this.rebuildWorld();
    this.loadBestGhost();
    this.resetToGrid(this.phase === 'menu' ? 'menu' : 'countdown');
    this.camInitialized = false;
    this.pushHudSnapshot(true);
  }

  public selectVehicle(vehicleId: VehicleId): void {
    if (this.vehicleId === vehicleId) return;
    this.vehicleId = vehicleId;
    this.rebuildVehicles();
    this.loadBestGhost();
    this.syncVehicleMeshToPhysics(0.016, 1);
    this.pushHudSnapshot(true);
  }

  public startRace(): void {
    this.audio.unlock();
    this.resetToGrid('countdown');
    this.countdownTimer = 2.65;
    this.lastCountdownInt = 4;
    this.pushHudSnapshot(true);
  }

  public restartRace(): void {
    this.audio.unlock();
    this.resetToGrid('countdown');
    this.countdownTimer = 2.1;
    this.lastCountdownInt = 3;
    this.pushHudSnapshot(true);
  }

  public openMenu(): void {
    this.clearAllInputs();
    this.resetToGrid('menu');
    this.audio.updateContinuous({ active: false, speedRatio: 0, driftIntensity: 0, isBoosting: false });
    this.pushHudSnapshot(true);
  }

  public respawnAtLastCheckpoint(): void {
    if (this.phase !== 'racing') return;
    const gateIdx = Math.min(this.checkpointsPassed, this.trackData.checkpoints.length - 1);
    const gate = this.trackData.checkpoints[gateIdx];
    placeStateAtGate(
      this.physics,
      this.trackData,
      gate,
      gateIdx === 0 ? -5.5 : 1.5,
      this.vehicleId
    );
    this.physicsAccumulator = 0;
    this.syncVehicleMeshToPhysics(0.016, 1);
    this.camInitialized = false;
    this.pushHudSnapshot(true);
  }

  public cycleCamera(): void {
    const order: CameraMode[] = ['chase', 'far', 'hood'];
    const idx = order.indexOf(this.cameraMode);
    this.cameraMode = order[(idx + 1) % order.length];
    this.pushHudSnapshot(true);
  }

  public setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    this.pushHudSnapshot(true);
  }

  public toggleGhost(): void {
    this.ghostEnabled = !this.ghostEnabled;
    if (this.ghostRig) {
      this.ghostRig.root.visible =
        this.ghostEnabled && this.phase === 'racing' && this.activeBestRecord !== null;
    }
    this.pushHudSnapshot(true);
  }

  public toggleMute(): void {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.isMuted());
    this.pushHudSnapshot(true);
  }

  public setTouchInput(partial: Partial<TouchInputState>): void {
    Object.assign(this.touchInput, partial);
  }

  private resetToGrid(targetPhase: RacePhase): void {
    this.phase = targetPhase;
    this.elapsedSec = 0;
    this.physicsAccumulator = 0;
    this.checkpointsPassed = 0;
    this.currentSplitsMs = [];
    this.lastSplit = null;
    this.finishSummary = null;
    this.liveGhostDeltaMs = null;
    this.ghostRecorder.reset();
    this.ghostPlayer.reset();
    this.clearSkids();
    this.clearSparks();
    this.worldScene?.resetCheckpointStates();

    placeStateAtGate(
      this.physics,
      this.trackData,
      this.trackData.checkpoints[0],
      -5.5,
      this.vehicleId
    );
    this.syncVehicleMeshToPhysics(0.016, 1);
    if (this.ghostRig) {
      this.ghostRig.root.visible = false;
    }
  }

  // --- Input & Focus Safety ---

  private handleWindowBlur = (): void => {
    this.clearAllInputs();
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.clearAllInputs();
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;
    const focusedInteractive = isInteractiveElementFocused();

    // Prevent page scroll for driving arrows/space only when not activating a focused menu button
    if (
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code) ||
      (code === 'Space' && (!focusedInteractive || this.phase === 'racing' || this.phase === 'countdown'))
    ) {
      e.preventDefault();
    }
    this.keys.add(code);

    if (e.repeat) return;

    // Ignore Enter/Space start-race shortcut when focus is on a button so keyboard navigation works cleanly
    if (this.phase === 'menu' && (code === 'Enter' || code === 'Space')) {
      if (!focusedInteractive) {
        this.startRace();
      }
      return;
    }
    if (this.phase === 'finished' && (code === 'Enter' || code === 'KeyR')) {
      if (code === 'KeyR' || !focusedInteractive) {
        this.restartRace();
      }
      return;
    }
    if (code === 'KeyR' && (this.phase === 'racing' || this.phase === 'countdown')) {
      this.restartRace();
    } else if ((code === 'KeyC' || code === 'Backspace') && this.phase === 'racing') {
      this.respawnAtLastCheckpoint();
    } else if (code === 'KeyV') {
      this.cycleCamera();
    } else if (code === 'KeyG') {
      this.toggleGhost();
    } else if (code === 'KeyM') {
      this.toggleMute();
    } else if (code === 'Escape' && this.phase !== 'menu') {
      this.openMenu();
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private readInput(): VehicleInput {
    const k = this.keys;
    const t = this.touchInput;
    const throttle = k.has('KeyW') || k.has('ArrowUp') || t.throttle ? 1 : 0;
    const brake = k.has('KeyS') || k.has('ArrowDown') || t.brake ? 1 : 0;
    const left = k.has('KeyA') || k.has('ArrowLeft') || t.left ? 1 : 0;
    const right = k.has('KeyD') || k.has('ArrowRight') || t.right ? 1 : 0;
    const drift = k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight') || t.drift;

    this.inputObj.throttle = throttle;
    this.inputObj.brake = brake;
    this.inputObj.steer = left - right;
    this.inputObj.drift = drift;
    return this.inputObj;
  }

  // --- Frame Tick & Software-WebGL Pacing ---

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.destroyed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.destroyed) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameMs) / 1000));
    this.lastFrameMs = now;
    this.totalTimeSec += dt;

    this.updateSimulation(dt, now);
    this.updateCamera(dt);
    this.updateSunShadowBounds();

    this.renderer.render(this.scene, this.camera);

    // Only push throttled 20Hz HUD telemetry during active countdown or racing (0 idle React renders on menu/finish)
    if (
      (this.phase === 'countdown' || this.phase === 'racing') &&
      now - this.lastHudPushMs >= 50
    ) {
      this.pushHudSnapshot(false);
      this.lastHudPushMs = now;
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private updateSimulation(dt: number, nowMs: number): void {
    this.wallSoundCooldown = Math.max(0, this.wallSoundCooldown - dt);
    let renderAlpha = 1;

    if (this.phase === 'countdown') {
      this.countdownTimer -= dt;
      const countInt = Math.ceil(this.countdownTimer);
      if (countInt < this.lastCountdownInt && countInt >= 1 && countInt <= 3) {
        this.lastCountdownInt = countInt;
        this.audio.playCountdownBeep(false);
        this.pushHudSnapshot(true);
      }
      if (this.countdownTimer <= 0) {
        this.phase = 'racing';
        this.lastCountdownInt = 0;
        this.physicsAccumulator = 0;
        this.audio.playCountdownBeep(true);
        this.ghostRecorder.record(
          0,
          this.physics.position.x,
          this.physics.position.y,
          this.physics.position.z,
          this.physics.yaw + this.physics.driftAngle,
          this.physics.pitch,
          this.physics.roll,
          false,
          false,
          this.physics.trackT,
          0,
          true
        );
        this.pushHudSnapshot(true);
      }
      const input = this.readInput();
      this.audio.updateContinuous({
        active: true,
        speedRatio: input.throttle * 0.28,
        driftIntensity: 0,
        isBoosting: false,
      });
    } else if (this.phase === 'racing') {
      const input = this.readInput();
      const fixedStep = this.fixedStep;
      this.physicsAccumulator += dt;

      let steps = 0;
      while (this.physicsAccumulator >= fixedStep && steps < 8) {
        this.physicsAccumulator -= fixedStep;
        steps++;
        this.elapsedSec += fixedStep;

        const nextGateIdx =
          this.checkpointsPassed < this.trackData.summary.checkpointCount
            ? this.checkpointsPassed + 1
            : 0;
        const targetGate = this.trackData.checkpoints[nextGateIdx];

        const crossFraction = stepVehiclePhysics(
          this.physics,
          this.trackData,
          this.vehicleId,
          input,
          fixedStep,
          targetGate
        );

        if (this.physics.boostJustTriggeredTier > 0) {
          this.audio.playBoostSurge(this.physics.boostJustTriggeredTier);
        }
        if (this.physics.wallHitImpulse > 0 && this.wallSoundCooldown <= 0) {
          this.audio.playWallBump(this.physics.wallHitImpulse);
          this.wallSoundCooldown = 0.22;
        }

        if (crossFraction !== null) {
          // Exact sub-millisecond crossing timestamp inside the 1/120s step
          const exactCrossingSec = Math.max(0, this.elapsedSec - fixedStep * (1 - crossFraction));
          this.handleGateCrossed(nextGateIdx, exactCrossingSec, crossFraction, nowMs);
          if (this.phase !== 'racing') break;
        }
      }

      if (this.phase === 'racing') {
        renderAlpha = THREE.MathUtils.clamp(this.physicsAccumulator / fixedStep, 0, 1);
        this.ghostRecorder.record(
          this.elapsedSec,
          this.physics.position.x,
          this.physics.position.y,
          this.physics.position.z,
          this.physics.yaw + this.physics.driftAngle,
          this.physics.pitch,
          this.physics.roll,
          this.physics.isDrifting,
          this.physics.boostTimer > 0,
          this.physics.trackT,
          this.physics.speed
        );
      }

      const maxSpeedMs = getVehicleMaxSpeedKmh(this.vehicleId) / 3.6;
      const speedRatio = Math.abs(this.physics.speed) / maxSpeedMs;
      const driftIntensity =
        this.physics.isDrifting && this.physics.grounded
          ? THREE.MathUtils.clamp(0.45 + this.physics.driftCharge * 0.55, 0, 1)
          : 0;
      this.audio.updateContinuous({
        active: this.phase === 'racing',
        speedRatio,
        driftIntensity,
        isBoosting: this.physics.boostTimer > 0,
      });

      this.updateSkidsAndSparks(dt);
    } else if (this.phase === 'finished') {
      this.physics.prevPosition.copy(this.physics.position);
      this.physics.velocity.multiplyScalar(Math.exp(-2.8 * dt));
      this.physics.position.addScaledVector(this.physics.velocity, dt);
      this.physics.speed *= Math.exp(-2.8 * dt);
      this.audio.updateContinuous({ active: false, speedRatio: 0, driftIntensity: 0, isBoosting: false });
      this.updateSparksOnly(dt);
    }

    this.syncVehicleMeshToPhysics(dt, renderAlpha);
    this.updateGhostPlayback(dt);
  }

  private handleGateCrossed(
    gateIdx: number,
    exactCrossingSec: number,
    crossFraction: number,
    nowMs: number
  ): void {
    const splitMs = Math.round(exactCrossingSec * 1000);
    const totalCps = this.trackData.summary.checkpointCount;

    if (gateIdx > 0) {
      this.checkpointsPassed = gateIdx;
      this.currentSplitsMs.push(splitMs);

      const pbSplit =
        this.activeBestRecord && this.activeBestRecord.checkpointSplitsMs[gateIdx - 1] !== undefined
          ? this.activeBestRecord.checkpointSplitsMs[gateIdx - 1]
          : null;
      const deltaMs = pbSplit !== null ? splitMs - pbSplit : null;

      this.lastSplit = {
        checkpointIndex: gateIdx,
        label: `CP ${gateIdx}/${totalCps}`,
        splitMs,
        deltaMs,
        timestamp: nowMs,
      };

      this.worldScene?.checkpointVisuals.forEach((cv) => {
        if (cv.gateIndex === gateIdx) cv.setState('passed');
        else if (gateIdx < totalCps && cv.gateIndex === gateIdx + 1) cv.setState('next');
        else if (gateIdx === totalCps && cv.gateIndex === 0) cv.setState('next');
      });

      this.audio.playCheckpointChime(gateIdx, deltaMs === null ? null : deltaMs <= 0);
      this.pushHudSnapshot(true);
    } else {
      // All checkpoints cleared -> Lap Finished with sub-millisecond accuracy!
      this.phase = 'finished';
      this.elapsedSec = exactCrossingSec;

      const p = this.physics;
      const finX = p.prevPosition.x + (p.position.x - p.prevPosition.x) * crossFraction;
      const finY = p.prevPosition.y + (p.position.y - p.prevPosition.y) * crossFraction;
      const finZ = p.prevPosition.z + (p.position.z - p.prevPosition.z) * crossFraction;
      const finYaw = lerpAngle(p.prevYaw + p.prevDriftAngle, p.yaw + p.driftAngle, crossFraction);
      const finPitch = lerpAngle(p.prevPitch, p.pitch, crossFraction);
      const finRoll = lerpAngle(p.prevRoll, p.roll, crossFraction);

      this.ghostRecorder.record(
        exactCrossingSec,
        finX,
        finY,
        finZ,
        finYaw,
        finPitch,
        finRoll,
        false,
        false,
        0,
        p.speed,
        true
      );

      const prevBestMs = this.activeBestRecord ? this.activeBestRecord.bestLapMs : null;
      const prevSplitsMs = this.activeBestRecord ? this.activeBestRecord.checkpointSplitsMs : null;
      const isNewBest = prevBestMs === null || splitMs < prevBestMs;

      if (isNewBest) {
        const newRecord: GhostRecord = {
          trackId: this.trackId,
          direction: this.direction,
          vehicleId: this.vehicleId,
          bestLapMs: splitMs,
          checkpointSplitsMs: [...this.currentSplitsMs],
          recordedAt: Date.now(),
          frames: this.ghostRecorder.getFrames(),
        };
        saveGhostRecord(newRecord);
        this.activeBestRecord = newRecord;
        this.ghostPlayer.setRecord(newRecord);
        this.callbacks.onRecordsChanged();
      }

      this.finishSummary = {
        trackId: this.trackId,
        direction: this.direction,
        vehicleId: this.vehicleId,
        lapTimeMs: splitMs,
        previousBestMs: prevBestMs,
        isNewBest,
        checkpointSplitsMs: [...this.currentSplitsMs],
        previousSplitsMs: prevSplitsMs,
      };

      this.worldScene?.checkpointVisuals[0]?.setState('passed');
      this.audio.playFinishFanfare(isNewBest);
      this.pushHudSnapshot(true);
    }
  }

  private syncVehicleMeshToPhysics(dt = 0.016, alpha = 1): void {
    const p = this.physics;
    _renderPos.lerpVectors(p.prevPosition, p.position, alpha);
    this.renderYaw = lerpAngle(p.prevYaw, p.yaw, alpha);
    this.renderPitch = lerpAngle(p.prevPitch, p.pitch, alpha);
    this.renderRoll = lerpAngle(p.prevRoll, p.roll, alpha);
    this.renderDriftAngle = p.prevDriftAngle + (p.driftAngle - p.prevDriftAngle) * alpha;

    if (!this.playerRig) return;
    this.playerRig.root.position.copy(_renderPos);
    this.playerRig.root.rotation.order = 'YXZ';
    this.playerRig.root.rotation.set(
      this.renderPitch,
      this.renderYaw + this.renderDriftAngle,
      this.renderRoll
    );

    this.playerRig.updateVisuals({
      dt,
      speed: p.speed,
      steerAngle: p.steerSmoothed,
      driftAngle: this.renderDriftAngle,
      isDrifting: p.isDrifting,
      isBraking: this.inputObj.brake > 0 && this.phase === 'racing',
      isBoosting: p.boostTimer > 0,
      driftTier: p.driftTier,
      elapsed: this.totalTimeSec,
      heightAboveRoad: p.heightAboveRoad,
    });
  }

  private updateGhostPlayback(dt: number): void {
    if (!this.ghostRig) return;
    const shouldShow =
      this.ghostEnabled &&
      (this.phase === 'racing' || this.phase === 'finished') &&
      this.activeBestRecord !== null;

    if (!shouldShow) {
      this.ghostRig.root.visible = false;
      this.liveGhostDeltaMs = null;
      return;
    }

    const ok = this.ghostPlayer.sampleAt(this.elapsedSec, _ghostPose);
    this.ghostRig.root.visible = ok && !_ghostPose.finished;
    if (!ok) return;

    this.ghostRig.root.position.set(_ghostPose.x, _ghostPose.y, _ghostPose.z);
    this.ghostRig.root.rotation.order = 'YXZ';
    this.ghostRig.root.rotation.set(_ghostPose.pitch, _ghostPose.yaw, _ghostPose.roll);

    // Use real recorded ghost speed so ghost car wheels spin accurately
    this.ghostRig.updateVisuals({
      dt,
      speed: _ghostPose.speed,
      steerAngle: 0,
      driftAngle: _ghostPose.drifting ? 0.25 : 0,
      isDrifting: _ghostPose.drifting,
      isBraking: false,
      isBoosting: _ghostPose.boosting,
      driftTier: _ghostPose.drifting ? 2 : 0,
      elapsed: this.totalTimeSec,
      heightAboveRoad: 0,
    });

    // True time-at-progress live ghost delta (elapsedSec - ghostTimeAtPlayerProgress)
    if (this.phase === 'racing' && this.elapsedSec > 0.35 && this.physics.unwrappedProgress > 0.005) {
      if (this.ghostPlayer.hasTrackProgressData()) {
        const ghostTimeAtPlayer = this.ghostPlayer.findTimeAtProgress(
          this.physics.unwrappedProgress
        );
        if (ghostTimeAtPlayer !== null) {
          this.liveGhostDeltaMs = Math.round((this.elapsedSec - ghostTimeAtPlayer) * 1000);
        }
      } else {
        // Legacy fallback for pre-upgrade saved ghosts lacking trackT
        const ghostSample = findNearestTrackSample(
          this.trackData,
          _ghostPose.x,
          _ghostPose.z,
          this.physics.nearestSampleIdx
        );
        let tDiff = this.physics.trackT - ghostSample.t;
        if (tDiff > 0.5) tDiff -= 1;
        if (tDiff < -0.5) tDiff += 1;
        const distDiffMeters = tDiff * this.trackData.totalLength;
        const refSpeed = Math.max(25, Math.abs(this.physics.speed));
        this.liveGhostDeltaMs = Math.round((-distDiffMeters / refSpeed) * 1000);
      }
    }
  }

  private updateSkidsAndSparks(dt: number): void {
    const p = this.physics;
    this.skidTimer += dt;

    if (p.isDrifting && p.grounded && Math.abs(p.speed) > 15) {
      if (this.vehicleId === 'drift-car' && this.skidTimer >= 0.025) {
        this.skidTimer = 0;
        const heading = p.yaw + p.driftAngle;
        _vFwd.set(-Math.sin(heading), 0, -Math.cos(heading));
        _vRight.set(Math.cos(heading), 0, -Math.sin(heading));

        for (const side of [-0.98, 0.98]) {
          _dummy.position.set(
            p.position.x - _vFwd.x * 1.25 + _vRight.x * side,
            p.position.y + 0.05,
            p.position.z - _vFwd.z * 1.25 + _vRight.z * side
          );
          _dummy.rotation.set(p.pitch, heading, p.roll, 'YXZ');
          _dummy.scale.set(1, 1, 1);
          _dummy.updateMatrix();
          this.skidInst.setMatrixAt(this.skidCursor, _dummy.matrix);
          this.skidCursor = (this.skidCursor + 1) % this.skidMax;
        }
        this.skidInst.instanceMatrix.needsUpdate = true;
      }

      if (p.driftTier >= 1) {
        const heading = p.yaw + p.driftAngle;
        _vFwd.set(-Math.sin(heading), 0, -Math.cos(heading));
        _vRight.set(Math.cos(heading), 0, -Math.sin(heading));
        const tierHex = p.driftTier === 3 ? 0x22d3ee : p.driftTier === 2 ? 0xf97316 : 0xf59e0b;

        for (let k = 0; k < p.driftTier; k++) {
          const sp = this.sparks[this.sparkCursor];
          this.sparkCursor = (this.sparkCursor + 1) % this.sparkMax;
          const side = k % 2 === 0 ? -1.0 : 1.0;
          sp.active = true;
          sp.x = p.position.x - _vFwd.x * 1.45 + _vRight.x * side;
          sp.y = p.position.y + 0.25;
          sp.z = p.position.z - _vFwd.z * 1.45 + _vRight.z * side;
          sp.vx = p.velocity.x * 0.35 + (Math.random() - 0.5) * 7 - _vFwd.x * 5;
          sp.vy = 2.5 + Math.random() * 4.5;
          sp.vz = p.velocity.z * 0.35 + (Math.random() - 0.5) * 7 - _vFwd.z * 5;
          sp.life = 0;
          sp.maxLife = 0.24 + Math.random() * 0.2;
          sp.colorHex = tierHex;
        }
      }
    }

    this.updateSparksOnly(dt);
  }

  private updateSparksOnly(dt: number): void {
    let dirty = false;
    for (let i = 0; i < this.sparkMax; i++) {
      const sp = this.sparks[i];
      if (!sp.active) continue;
      dirty = true;
      sp.life += dt;
      if (sp.life >= sp.maxLife) {
        sp.active = false;
        _dummy.position.set(0, -500, 0);
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        this.sparkInst.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      sp.vy -= 18 * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.z += sp.vz * dt;
      const frac = 1 - sp.life / sp.maxLife;
      _dummy.position.set(sp.x, sp.y, sp.z);
      _dummy.rotation.set(0, Math.atan2(sp.vx, sp.vz), 0);
      _dummy.scale.set(frac, frac, frac * 1.6);
      _dummy.updateMatrix();
      this.sparkInst.setMatrixAt(i, _dummy.matrix);
      _sparkColor.setHex(sp.colorHex);
      this.sparkInst.setColorAt(i, _sparkColor);
    }
    if (dirty) {
      this.sparkInst.instanceMatrix.needsUpdate = true;
      if (this.sparkInst.instanceColor) this.sparkInst.instanceColor.needsUpdate = true;
    }
  }

  // --- Exponentially Damped Camera Choreography ---

  private updateCamera(dt: number): void {
    const p = this.physics;

    if (this.phase === 'menu') {
      const angle = this.totalTimeSec * 0.28 + 0.65;
      const radius = 10.5;
      const desiredX = _renderPos.x + Math.cos(angle) * radius;
      const desiredY = _renderPos.y + 4.4 + Math.sin(this.totalTimeSec * 0.5) * 0.45;
      const desiredZ = _renderPos.z + Math.sin(angle) * radius;

      _vPos.set(desiredX, desiredY, desiredZ);
      _vTarget.set(_renderPos.x, _renderPos.y + 1.15, _renderPos.z);

      if (!this.camInitialized) {
        this.camPos.copy(_vPos);
        this.camLookAt.copy(_vTarget);
        this.camInitialized = true;
      } else {
        const alpha = 1 - Math.exp(-5 * dt);
        this.camPos.lerp(_vPos, alpha);
        this.camLookAt.lerp(_vTarget, alpha);
      }

      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLookAt);
      const targetFov = 54;
      if (Math.abs(this.camera.fov - targetFov) > 0.05) {
        this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-6 * dt));
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    const heading = this.renderYaw + this.renderDriftAngle * 0.35;
    _vFwd.set(-Math.sin(heading), 0, -Math.cos(heading));
    _vRight.set(Math.cos(heading), 0, -Math.sin(heading));

    let backDist = 8.4;
    let heightOffset = 3.45;
    let lookAhead = 12.0;
    let posLambda = 9.5;
    let lookLambda = 13.0;

    if (this.cameraMode === 'far') {
      backDist = 11.8;
      heightOffset = 5.1;
      lookAhead = 15.0;
      posLambda = 7.8;
    } else if (this.cameraMode === 'hood') {
      backDist = -0.35;
      heightOffset = this.vehicleId === 'hovercraft' ? 1.55 : 1.52;
      lookAhead = 22.0;
      posLambda = 28.0;
      lookLambda = 24.0;
    }

    const driftLateralOffset = this.renderDriftAngle * 2.2;
    _vPos
      .copy(_renderPos)
      .addScaledVector(_vFwd, -backDist)
      .addScaledVector(_vRight, driftLateralOffset)
      .addScaledVector(_vUp, heightOffset);

    _vTarget
      .copy(_renderPos)
      .addScaledVector(_vFwd, lookAhead)
      .addScaledVector(_vUp, this.cameraMode === 'hood' ? 1.25 : 1.55);

    if (!this.camInitialized) {
      this.camPos.copy(_vPos);
      this.camLookAt.copy(_vTarget);
      this.camInitialized = true;
    } else {
      this.camPos.lerp(_vPos, 1 - Math.exp(-posLambda * dt));
      this.camLookAt.lerp(_vTarget, 1 - Math.exp(-lookLambda * dt));
    }

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLookAt);

    const targetCamRoll = this.prefersReducedMotion
      ? 0
      : THREE.MathUtils.clamp(-p.steerSmoothed * 0.032 - this.renderDriftAngle * 0.055, -0.075, 0.075);
    this.camRoll += (targetCamRoll - this.camRoll) * (1 - Math.exp(-8 * dt));
    this.camera.rotateZ(this.camRoll);

    const speedFrac = THREE.MathUtils.clamp(Math.abs(p.speed) / 80, 0, 1.25);
    const boostFov = p.boostTimer > 0 ? 5.5 : 0;
    const baseFov = this.cameraMode === 'hood' ? 68 : 62;
    const targetFov = this.prefersReducedMotion ? baseFov : baseFov + speedFrac * 12 + boostFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-6.5 * dt));
      this.camera.updateProjectionMatrix();
    }
  }

  private updateSunShadowBounds(): void {
    if (this.isSoftwareGl) return;
    this.sunLight.target.position.copy(_renderPos);
    this.sunLight.position.set(_renderPos.x + 85, _renderPos.y + 115, _renderPos.z + 75);
    this.sunLight.target.updateMatrixWorld();
  }

  private pushHudSnapshot(force: boolean): void {
    if (!force && this.destroyed) return;
    const p = this.physics;
    const speedKmh = Math.round(Math.abs(p.speed) * 3.6);
    const maxSpeedKmh = getVehicleMaxSpeedKmh(this.vehicleId);

    this.callbacks.onHudUpdate({
      phase: this.phase,
      trackId: this.trackId,
      direction: this.direction,
      vehicleId: this.vehicleId,
      cameraMode: this.cameraMode,
      ghostEnabled: this.ghostEnabled,
      hasGhost: this.activeBestRecord !== null,
      muted: this.audio.isMuted(),
      countdownValue: Math.max(0, Math.ceil(this.countdownTimer)),
      elapsedMs: Math.round(this.elapsedSec * 1000),
      speedKmh,
      maxSpeedKmh,
      driftCharge: p.driftCharge,
      driftTier: p.driftTier,
      isDrifting: p.isDrifting,
      isBoosting: p.boostTimer > 0,
      checkpointsPassed: this.checkpointsPassed,
      totalCheckpoints: this.trackData.summary.checkpointCount,
      liveGhostDeltaMs: this.liveGhostDeltaMs,
      lastSplit: this.lastSplit,
      bestLapMs: this.activeBestRecord ? this.activeBestRecord.bestLapMs : null,
      finishSummary: this.finishSummary,
      offTrackWarning: p.offTrack,
    });
  }

  private handleResize = (): void => {
    if (this.destroyed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onContextLost(true);
  };

  private handleContextRestored = (): void => {
    this.callbacks.onContextLost(false);
  };

  public dispose(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.worldScene?.dispose();
    this.playerRig?.dispose();
    this.ghostRig?.dispose();
    this.skidInst.geometry.dispose();
    (this.skidInst.material as THREE.Material).dispose();
    this.sparkInst.geometry.dispose();
    (this.sparkInst.material as THREE.Material).dispose();
    this.textures.dispose();
    this.audio.dispose();

    if (this.scene.environment) {
      this.scene.environment.dispose();
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
