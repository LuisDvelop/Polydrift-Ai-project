import { RotateCcw, SlidersHorizontal, ArrowLeftRight, Trophy } from 'lucide-react';
import { TRACK_LIST } from '../game/tracks';
import {
  FinishSummary,
  VEHICLE_SPECS,
  formatDeltaMs,
  formatLapTime,
} from '../game/types';

interface FinishOverlayProps {
  summary: FinishSummary;
  onRaceAgain: () => void;
  onSwitchVehicle: () => void;
  onOpenGarage: () => void;
}

export function FinishOverlay({
  summary,
  onRaceAgain,
  onSwitchVehicle,
  onOpenGarage,
}: FinishOverlayProps) {
  const track = TRACK_LIST.find((t) => t.id === summary.trackId);
  const vehicle = VEHICLE_SPECS[summary.vehicleId];
  const otherVehicle =
    summary.vehicleId === 'drift-car' ? VEHICLE_SPECS.hovercraft : VEHICLE_SPECS['drift-car'];
  const lapDelta =
    summary.previousBestMs !== null ? summary.lapTimeMs - summary.previousBestMs : null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/55 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Lap Complete Summary"
      aria-live="polite"
    >
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#0F172A]/95 p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-slate-400">
              {track?.name}
              {summary.direction === 'reverse' ? ' (Reverse)' : ''} · {vehicle.name}
            </div>
            <h2 className="font-display mt-1 text-2xl font-bold text-slate-50">
              Lap Complete
            </h2>
          </div>

          {summary.isNewBest && (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 whitespace-nowrap">
              <Trophy className="h-3.5 w-3.5" />
              New Best · Ghost Saved
            </div>
          )}
        </div>

        {/* Final Time Highlight */}
        <div className="mt-4 flex items-baseline justify-between rounded-xl border border-white/10 bg-slate-900/90 px-4 py-3.5 sm:px-5 sm:py-4">
          <div>
            <div className="text-xs text-slate-400">Final Time</div>
            <div className="font-display tabular-nums mt-0.5 text-3xl font-bold text-slate-50 sm:text-4xl">
              {formatLapTime(summary.lapTimeMs)}
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-slate-400">
              {lapDelta !== null ? 'vs Previous Best' : 'First Recorded Run'}
            </div>
            <div
              className={`font-mono-data mt-1 text-base font-bold sm:text-lg ${
                lapDelta === null
                  ? 'text-cyan-400'
                  : lapDelta <= 0
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}
            >
              {lapDelta !== null ? formatDeltaMs(lapDelta) : 'PB Set'}
            </div>
          </div>
        </div>

        {/* Checkpoint Sector Splits Table */}
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
            <span>Checkpoint Splits</span>
            <span>Split Time · Delta</span>
          </div>
          <div className="max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-slate-900/70 divide-y divide-white/6">
            {summary.checkpointSplitsMs.map((splitMs, idx) => {
              const prevSplit = summary.previousSplitsMs?.[idx] ?? null;
              const delta = prevSplit !== null ? splitMs - prevSplit : null;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between px-4 py-2 text-xs"
                >
                  <span className="text-slate-300">Checkpoint {idx + 1}</span>
                  <div className="flex items-center gap-4 font-mono-data">
                    <span className="text-slate-100">{formatLapTime(splitMs)}</span>
                    <span
                      className={`w-16 text-right font-semibold ${
                        delta === null
                          ? 'text-slate-500'
                          : delta <= 0
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {delta !== null ? formatDeltaMs(delta) : '--'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onRaceAgain}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            Race Again
          </button>

          <button
            type="button"
            onClick={onSwitchVehicle}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-700 whitespace-nowrap cursor-pointer"
          >
            <ArrowLeftRight className="h-3.5 w-3.5 text-cyan-400" />
            Try {otherVehicle.name}
          </button>

          <button
            type="button"
            onClick={onOpenGarage}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 whitespace-nowrap cursor-pointer"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Tracks
          </button>
        </div>
      </div>
    </div>
  );
}
