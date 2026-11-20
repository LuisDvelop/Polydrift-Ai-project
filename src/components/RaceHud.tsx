import { TRACK_LIST } from '../game/tracks';
import {
  HudSnapshot,
  TouchInputState,
  formatDeltaMs,
  formatLapTime,
} from '../game/types';

interface RaceHudProps {
  hud: HudSnapshot;
  isTouchDevice: boolean;
  dockCollapsed: boolean;
  onTouchInput: (partial: Partial<TouchInputState>) => void;
}

export function RaceHud({
  hud,
  isTouchDevice,
  dockCollapsed,
  onTouchInput,
}: RaceHudProps) {
  const track = TRACK_LIST.find((t) => t.id === hud.trackId);
  const showSplitToast =
    hud.lastSplit !== null && performance.now() - hud.lastSplit.timestamp < 2400;

  const driftBarColor =
    hud.driftTier === 3
      ? 'bg-cyan-400'
      : hud.driftTier === 2
      ? 'bg-orange-400'
      : hud.driftTier === 1
      ? 'bg-amber-400'
      : 'bg-slate-400';

  const speedPct = Math.min(100, Math.round((hud.speedKmh / (hud.maxSpeedKmh * 1.18)) * 100));

  const bindTouchKey = (key: keyof TouchInputState) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if capture unsupported
      }
      onTouchInput({ [key]: true });
    },
    onPointerUp: () => onTouchInput({ [key]: false }),
    onPointerCancel: () => onTouchInput({ [key]: false }),
    onLostPointerCapture: () => onTouchInput({ [key]: false }),
  });

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-3 sm:p-5">
      {/* Top Bar: Minimalist Centered Telemetry Cluster */}
      <div className="flex items-start justify-between gap-3">
        {/* Top-Left Compact Track Context */}
        <div className="hidden rounded-xl border border-white/10 bg-[#0F172A]/82 px-3.5 py-2 sm:block">
          <div className="font-display text-sm font-bold text-slate-100 whitespace-nowrap">
            {track?.name ?? 'Apex Ridge'}
            {hud.direction === 'reverse' && (
              <span className="ml-1.5 text-xs font-semibold text-cyan-400">REV</span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400 whitespace-nowrap">
            <span>Best {formatLapTime(hud.bestLapMs)}</span>
            {hud.hasGhost && hud.ghostEnabled && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-cyan-400">Ghost Active</span>
              </>
            )}
          </div>
        </div>

        {/* Top-Center Primary Lap Timer & Checkpoint Counter */}
        <div className="mx-auto flex flex-col items-center">
          <div className="flex items-center gap-3.5 rounded-xl border border-white/12 bg-[#0F172A]/88 px-3.5 py-2 shadow-lg sm:gap-5 sm:px-5 sm:py-2.5">
            <div className="text-center">
              <div className="text-[10px] text-slate-400 sm:text-[11px]">Lap Time</div>
              <div className="font-display tabular-nums text-xl font-bold leading-tight text-slate-50 sm:text-3xl">
                {formatLapTime(hud.elapsedMs)}
              </div>
            </div>

            <div className="h-7 w-px bg-white/12 sm:h-8" aria-hidden="true" />

            <div className="text-center">
              <div className="text-[10px] text-slate-400 sm:text-[11px]">Checkpoints</div>
              <div className="font-display tabular-nums text-lg font-bold leading-tight text-slate-100 sm:text-2xl">
                {hud.checkpointsPassed}
                <span className="text-slate-400"> / {hud.totalCheckpoints}</span>
              </div>
            </div>

            {hud.liveGhostDeltaMs !== null && hud.phase === 'racing' && (
              <>
                <div className="h-7 w-px bg-white/12 sm:h-8" aria-hidden="true" />
                <div className="text-center">
                  <div className="text-[10px] text-slate-400 sm:text-[11px]">vs Ghost</div>
                  <div
                    className={`font-mono-data text-sm font-bold leading-tight sm:text-lg ${
                      hud.liveGhostDeltaMs <= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatDeltaMs(hud.liveGhostDeltaMs)}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Off-track Curb Warning & Accessible Checkpoint Split Toast */}
          <div className="mt-2 flex flex-col items-center gap-1.5">
            {hud.offTrackWarning && hud.phase === 'racing' && (
              <div
                role="status"
                className="rounded-md border border-amber-400/40 bg-[#0F172A]/90 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300 shadow"
              >
                Off track · Curb slowdown
              </div>
            )}

            <div aria-live="polite" aria-atomic="true">
              {showSplitToast && hud.lastSplit && (
                <div className="flex items-center gap-3 rounded-lg border border-white/12 bg-[#0F172A]/90 px-4 py-1.5 text-xs font-semibold shadow-md">
                  <span className="text-slate-200">{hud.lastSplit.label}</span>
                  <span className="font-mono-data text-slate-100">
                    {formatLapTime(hud.lastSplit.splitMs)}
                  </span>
                  {hud.lastSplit.deltaMs !== null && (
                    <span
                      className={`font-mono-data font-bold ${
                        hud.lastSplit.deltaMs <= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {formatDeltaMs(hud.lastSplit.deltaMs)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Spacer to balance top-left card on desktop */}
        <div className="hidden w-44 sm:block" aria-hidden="true" />
      </div>

      {/* Center Countdown Banner (3 - 2 - 1 - GO) */}
      {hud.phase === 'countdown' && (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
          <div className="rounded-2xl border border-white/15 bg-[#0F172A]/86 px-10 py-5 text-center shadow-2xl">
            <div className="text-xs font-medium text-slate-300">Get Ready</div>
            <div className="font-display tabular-nums mt-1 text-6xl font-bold text-amber-400 sm:text-7xl">
              {hud.countdownValue > 0 ? hud.countdownValue : 'GO'}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Area: Clean non-overlapping layout for both Touch and Desktop */}
      <div
        className={`flex flex-col gap-2.5 ${
          isTouchDevice
            ? dockCollapsed
              ? 'mb-11'
              : 'mb-28'
            : 'sm:flex-row sm:items-end sm:justify-end'
        }`}
      >
        {/* Compact Single-Bar Speedometer on narrow/touch portrait screens, Full Card on sm+ */}
        <div className="flex justify-end">
          {/* Compact Mobile Bar */}
          <div className="flex w-full items-center gap-3 rounded-xl border border-white/12 bg-[#0F172A]/88 px-3 py-2 shadow-lg sm:hidden">
            <div className="flex items-baseline gap-1 shrink-0">
              <span className="font-display tabular-nums text-2xl font-bold leading-none text-slate-50">
                {hud.speedKmh}
              </span>
              <span className="text-[10px] text-slate-400">km/h</span>
            </div>

            <div className="flex-1 space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full transition-[width] duration-75 ${
                    hud.isBoosting ? 'bg-cyan-400' : 'bg-slate-200'
                  }`}
                  style={{ width: `${speedPct}%` }}
                />
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full transition-[width] duration-75 ${driftBarColor}`}
                  style={{ width: `${Math.round(hud.driftCharge * 100)}%` }}
                />
              </div>
            </div>

            <div className="text-right text-[10px] font-semibold shrink-0">
              {hud.isBoosting ? (
                <span className="text-cyan-400">Turbo</span>
              ) : hud.driftTier > 0 ? (
                <span className="text-amber-400">Drift T{hud.driftTier}</span>
              ) : (
                <span className="text-slate-400">Drift</span>
              )}
            </div>
          </div>

          {/* Desktop / Tablet Speedometer Card */}
          <div className="hidden w-56 rounded-xl border border-white/12 bg-[#0F172A]/88 p-3.5 shadow-xl sm:block">
            <div className="flex items-baseline justify-between">
              <div className="font-display tabular-nums text-4xl font-bold leading-none text-slate-50">
                {hud.speedKmh}
              </div>
              <div className="text-right">
                <div className="text-[11px] font-medium text-slate-400">km/h</div>
                {hud.isBoosting && (
                  <div className="text-[11px] font-bold text-cyan-400">Turbo Surge</div>
                )}
              </div>
            </div>

            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full transition-[width] duration-75 ${
                  hud.isBoosting ? 'bg-cyan-400' : 'bg-slate-200'
                }`}
                style={{ width: `${speedPct}%` }}
              />
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Drift Boost</span>
              <span
                className={`font-semibold ${
                  hud.driftTier === 3
                    ? 'text-cyan-400'
                    : hud.driftTier === 2
                    ? 'text-orange-400'
                    : hud.driftTier === 1
                    ? 'text-amber-400'
                    : 'text-slate-500'
                }`}
              >
                {hud.driftTier === 3
                  ? 'Overdrive'
                  : hud.driftTier === 2
                  ? 'Tier 2'
                  : hud.driftTier === 1
                  ? 'Tier 1'
                  : 'Hold Space'}
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full transition-[width] duration-75 ${driftBarColor}`}
                style={{ width: `${Math.round(hud.driftCharge * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Dedicated Touch Controls Row — shown exclusively when (pointer: coarse) matches */}
        {isTouchDevice && (
          <div className="pointer-events-auto flex items-center justify-between gap-2 select-none">
            <div className="flex items-center gap-2">
              <button
                type="button"
                {...bindTouchKey('left')}
                style={{ touchAction: 'none' }}
                className="h-12 w-14 rounded-xl border border-white/15 bg-[#0F172A]/88 font-display text-lg font-bold text-slate-100 active:bg-amber-500 active:text-slate-950"
                aria-label="Steer Left"
              >
                ◀
              </button>
              <button
                type="button"
                {...bindTouchKey('right')}
                style={{ touchAction: 'none' }}
                className="h-12 w-14 rounded-xl border border-white/15 bg-[#0F172A]/88 font-display text-lg font-bold text-slate-100 active:bg-amber-500 active:text-slate-950"
                aria-label="Steer Right"
              >
                ▶
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                {...bindTouchKey('brake')}
                style={{ touchAction: 'none' }}
                className="h-12 rounded-xl border border-rose-400/40 bg-[#0F172A]/88 px-3 text-xs font-bold text-rose-300 active:bg-rose-500 active:text-slate-950 whitespace-nowrap"
              >
                Brake
              </button>
              <button
                type="button"
                {...bindTouchKey('drift')}
                style={{ touchAction: 'none' }}
                className="h-12 rounded-xl border border-amber-400/40 bg-[#0F172A]/88 px-3 text-xs font-bold text-amber-300 active:bg-amber-500 active:text-slate-950 whitespace-nowrap"
              >
                Drift
              </button>
              <button
                type="button"
                {...bindTouchKey('throttle')}
                style={{ touchAction: 'none' }}
                className="h-12 rounded-xl border border-emerald-400/40 bg-[#0F172A]/88 px-4 text-xs font-bold text-emerald-300 active:bg-emerald-500 active:text-slate-950 whitespace-nowrap"
              >
                Gas
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
