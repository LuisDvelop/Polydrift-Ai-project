/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlDock } from './components/ControlDock';
import { FinishOverlay } from './components/FinishOverlay';
import { LaunchOverlay } from './components/LaunchOverlay';
import { RaceHud } from './components/RaceHud';
import { RaceEngine } from './game/engine';
import { loadAllPersonalBests } from './game/ghost';
import {
  HudSnapshot,
  TouchInputState,
  TrackDirection,
  TrackId,
  VehicleId,
} from './game/types';

const INITIAL_HUD: HudSnapshot = {
  phase: 'menu',
  trackId: 'pine-ridge',
  direction: 'forward',
  vehicleId: 'drift-car',
  cameraMode: 'chase',
  ghostEnabled: true,
  hasGhost: false,
  muted: false,
  countdownValue: 3,
  elapsedMs: 0,
  speedKmh: 0,
  maxSpeedKmh: 245,
  driftCharge: 0,
  driftTier: 0,
  isDrifting: false,
  isBoosting: false,
  checkpointsPassed: 0,
  totalCheckpoints: 5,
  liveGhostDeltaMs: null,
  lastSplit: null,
  bestLapMs: null,
  finishSummary: null,
  offTrackWarning: false,
};

function detectCoarsePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RaceEngine | null>(null);

  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(() => detectCoarsePointer());
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [personalBests, setPersonalBests] = useState<Record<string, number | null>>(() =>
    loadAllPersonalBests()
  );
  // Start dock collapsed on touch screens so touch controls never collide with it
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(() => detectCoarsePointer());
  const [webglError, setWebglError] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);

  // Reactive (pointer: coarse) media query listener
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const onChange = (e: MediaQueryListEvent) => {
      setIsTouchDevice(e.matches);
      if (e.matches) setDockCollapsed(true);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Mount Three.js RaceEngine once inside an isolated ref container
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    try {
      const engine = new RaceEngine(mount, {
        onHudUpdate: (snapshot) => {
          setHud(snapshot);
        },
        onRecordsChanged: () => {
          setPersonalBests(loadAllPersonalBests());
        },
        onContextLost: (lost) => {
          setContextLost(lost);
        },
      });
      engineRef.current = engine;
    } catch (err) {
      setWebglError(
        err instanceof Error ? err.message : 'Unable to initialize 3D WebGL viewport.'
      );
    }

    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Keyboard shortcut H to collapse/expand bottom control dock
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyH' && !e.repeat) {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSelectTrack = useCallback((trackId: TrackId) => {
    engineRef.current?.selectTrack(trackId);
  }, []);

  const handleSelectDirection = useCallback((direction: TrackDirection) => {
    engineRef.current?.selectDirection(direction);
  }, []);

  const handleSelectVehicle = useCallback((vehicleId: VehicleId) => {
    engineRef.current?.selectVehicle(vehicleId);
  }, []);

  const handleStartRace = useCallback(() => {
    engineRef.current?.startRace();
  }, []);

  const handleRestart = useCallback(() => {
    engineRef.current?.restartRace();
  }, []);

  const handleOpenGarage = useCallback(() => {
    engineRef.current?.openMenu();
  }, []);

  const handleRespawnCheckpoint = useCallback(() => {
    engineRef.current?.respawnAtLastCheckpoint();
  }, []);

  const handleCycleCamera = useCallback(() => {
    engineRef.current?.cycleCamera();
  }, []);

  const handleToggleGhost = useCallback(() => {
    engineRef.current?.toggleGhost();
  }, []);

  const handleToggleMute = useCallback(() => {
    engineRef.current?.toggleMute();
  }, []);

  const handleTouchInput = useCallback((partial: Partial<TouchInputState>) => {
    engineRef.current?.setTouchInput(partial);
  }, []);

  const handleSwitchVehicleAndRace = useCallback(() => {
    const nextVehicle: VehicleId = hud.vehicleId === 'drift-car' ? 'hovercraft' : 'drift-car';
    engineRef.current?.selectVehicle(nextVehicle);
    engineRef.current?.startRace();
  }, [hud.vehicleId]);

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-[#0F172A]">
      {/* Dedicated WebGL Mount Container — completely isolated from React HUD re-renders */}
      <div
        ref={canvasMountRef}
        className="fixed inset-0 h-full w-full"
        aria-label="Apex Ridge 3D Racing Track Viewport"
      />

      {/* Graceful WebGL Fallback or Context Lost Overlay */}
      {(webglError || contextLost) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-6">
          <div className="max-w-md rounded-2xl border border-white/15 bg-slate-900 p-6 text-center shadow-2xl">
            <h1 className="font-display text-2xl font-bold text-slate-50">
              {contextLost ? '3D Graphics Context Paused' : 'WebGL Unavailable'}
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              {contextLost
                ? 'The browser paused the 3D rendering context. Waiting for automatic recovery, or reload to resume racing.'
                : webglError}
            </p>
          </div>
        </div>
      )}

      {/* Phase-Based Semantic DOM Overlays */}
      {!webglError && hud.phase === 'menu' && (
        <LaunchOverlay
          selectedTrack={hud.trackId}
          selectedDirection={hud.direction}
          selectedVehicle={hud.vehicleId}
          personalBests={personalBests}
          isTouchDevice={isTouchDevice}
          onSelectTrack={handleSelectTrack}
          onSelectDirection={handleSelectDirection}
          onSelectVehicle={handleSelectVehicle}
          onStartRace={handleStartRace}
        />
      )}

      {!webglError && (hud.phase === 'countdown' || hud.phase === 'racing') && (
        <>
          <RaceHud
            hud={hud}
            isTouchDevice={isTouchDevice}
            dockCollapsed={dockCollapsed}
            onTouchInput={handleTouchInput}
          />
          <ControlDock
            hud={hud}
            collapsed={dockCollapsed}
            onToggleCollapse={() => setDockCollapsed((c) => !c)}
            onCycleCamera={handleCycleCamera}
            onToggleGhost={handleToggleGhost}
            onToggleMute={handleToggleMute}
            onRespawnCheckpoint={handleRespawnCheckpoint}
            onRestart={handleRestart}
            onOpenGarage={handleOpenGarage}
          />
        </>
      )}

      {!webglError && hud.phase === 'finished' && hud.finishSummary && (
        <FinishOverlay
          summary={hud.finishSummary}
          onRaceAgain={handleRestart}
          onSwitchVehicle={handleSwitchVehicleAndRace}
          onOpenGarage={handleOpenGarage}
        />
      )}
    </div>
  );
}
