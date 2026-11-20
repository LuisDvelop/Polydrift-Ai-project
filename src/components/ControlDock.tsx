import {
  Camera,
  ChevronDown,
  ChevronUp,
  Flag,
  Ghost,
  RotateCcw,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { CameraMode, HudSnapshot } from '../game/types';

interface ControlDockProps {
  hud: HudSnapshot;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onCycleCamera: () => void;
  onToggleGhost: () => void;
  onToggleMute: () => void;
  onRespawnCheckpoint: () => void;
  onRestart: () => void;
  onOpenGarage: () => void;
}

const CAMERA_LABELS: Record<CameraMode, string> = {
  chase: 'Chase',
  far: 'Far',
  hood: 'Hood',
};

export function ControlDock({
  hud,
  collapsed,
  onToggleCollapse,
  onCycleCamera,
  onToggleGhost,
  onToggleMute,
  onRespawnCheckpoint,
  onRestart,
  onOpenGarage,
}: ControlDockProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-20 flex flex-col items-center px-2">
      {/* Attached Collapse / Expand Tab */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-t-lg border border-b-0 border-white/12 bg-[#0F172A]/88 px-3 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:text-slate-50 whitespace-nowrap cursor-pointer"
        title="Toggle Controls (H)"
      >
        {collapsed ? (
          <>
            <ChevronUp className="h-3.5 w-3.5" />
            Show Controls
          </>
        ) : (
          <>
            <ChevronDown className="h-3.5 w-3.5" />
            Hide Controls
          </>
        )}
      </button>

      {/* Single-Row Full-Width-Centered Dock (w-max max-w-[94vw] prevents desktop half-width wrapping) */}
      <div
        className={`pointer-events-auto w-max max-w-[94vw] overflow-hidden transition-[transform,opacity] duration-200 ${
          collapsed ? 'pointer-events-none h-0 translate-y-16 opacity-0' : 'translate-y-0 opacity-100'
        }`}
      >
        <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-[#0F172A]/90 px-2.5 py-2 shadow-xl sm:flex-nowrap">
          <button
            type="button"
            onClick={onCycleCamera}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800/90 px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:bg-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            title="Cycle Camera (V)"
          >
            <Camera className="h-3.5 w-3.5 text-slate-300" />
            Cam: {CAMERA_LABELS[hud.cameraMode]}
          </button>

          <button
            type="button"
            onClick={onToggleGhost}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              hud.ghostEnabled
                ? 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30'
                : 'bg-slate-800/90 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}
            title="Toggle PB Ghost (G)"
          >
            <Ghost className="h-3.5 w-3.5" />
            {hud.ghostEnabled ? 'Ghost On' : 'Ghost Off'}
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800/90 px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:bg-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            title="Toggle Audio (M)"
          >
            {hud.muted ? (
              <>
                <VolumeX className="h-3.5 w-3.5 text-rose-400" />
                Muted
              </>
            ) : (
              <>
                <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                Audio
              </>
            )}
          </button>

          <div className="mx-0.5 hidden h-5 w-px bg-white/12 sm:block" aria-hidden="true" />

          <button
            type="button"
            onClick={onRespawnCheckpoint}
            disabled={hud.phase !== 'racing'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800/90 px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:bg-slate-700 disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
            title="Respawn at Checkpoint (C)"
          >
            <Flag className="h-3.5 w-3.5 text-amber-400" />
            Respawn CP
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800/90 px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:bg-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            title="Restart Lap (R)"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-200" />
            Restart
          </button>

          <button
            type="button"
            onClick={onOpenGarage}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/30 whitespace-nowrap shrink-0 cursor-pointer"
            title="Tracks & Vehicles (Esc)"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Tracks &amp; Garage
          </button>
        </div>
      </div>
    </div>
  );
}
