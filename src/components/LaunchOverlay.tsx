import { Play, Flag, Gauge, Sparkles, ArrowLeftRight } from 'lucide-react';
import { getTrackList } from '../game/tracks';
import {
  TrackDirection,
  TrackId,
  TrackOutline,
  VEHICLE_SPECS,
  VehicleId,
  formatLapTime,
} from '../game/types';

interface LaunchOverlayProps {
  selectedTrack: TrackId;
  selectedDirection: TrackDirection;
  selectedVehicle: VehicleId;
  personalBests: Record<string, number | null>;
  isTouchDevice: boolean;
  onSelectTrack: (trackId: TrackId) => void;
  onSelectDirection: (direction: TrackDirection) => void;
  onSelectVehicle: (vehicleId: VehicleId) => void;
  onStartRace: () => void;
}

function TrackMapSvg({
  outline,
  accentHex,
  selected,
}: {
  outline: TrackOutline;
  accentHex: string;
  selected: boolean;
}) {
  const pathD =
    outline.points
      .map(([x, y], idx) => `${idx === 0 ? 'M' : 'L'}${x},${y}`)
      .join(' ') + ' Z';
  const [sx, sy] = outline.startPoint;
  const [tx, ty] = outline.forwardTangent;
  // Arrow tip slightly ahead of start line along active direction
  const ax = sx + tx * 8;
  const ay = sy + ty * 8;
  const px = -ty * 3.2;
  const py = tx * 3.2;
  const arrowPoints = `${ax},${ay} ${sx + tx * 2.5 + px},${sy + ty * 2.5 + py} ${sx + tx * 2.5 - px},${sy + ty * 2.5 - py}`;

  return (
    <svg
      viewBox="0 0 100 64"
      className="h-10 w-16 shrink-0 sm:h-11 sm:w-[70px]"
      aria-hidden="true"
    >
      <path
        d={pathD}
        fill="none"
        stroke={selected ? accentHex : '#64748B'}
        strokeWidth={selected ? 3.4 : 2.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={selected ? 0.95 : 0.65}
      />
      <circle cx={sx} cy={sy} r={3.2} fill="#F8FAFC" />
      <polygon points={arrowPoints} fill={selected ? '#F59E0B' : '#CBD5E1'} />
    </svg>
  );
}

export function LaunchOverlay({
  selectedTrack,
  selectedDirection,
  selectedVehicle,
  personalBests,
  isTouchDevice,
  onSelectTrack,
  onSelectVehicle,
  onSelectDirection,
  onStartRace,
}: LaunchOverlayProps) {
  const tracks = getTrackList(selectedDirection);
  const activeBest =
    personalBests[`${selectedTrack}:${selectedDirection}:${selectedVehicle}`] ?? null;

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex max-h-[100dvh] flex-col justify-between overflow-y-auto p-3 sm:p-5 [@media(max-height:480px)]:p-2">
      {/* Top Minimal Brand Header */}
      <div className="flex items-start justify-between gap-3 shrink-0">
        <div className="pointer-events-auto rounded-xl border border-white/12 bg-[#0F172A]/88 px-3.5 py-2 shadow-xl sm:px-5 sm:py-3 [@media(max-height:480px)]:px-3 [@media(max-height:480px)]:py-1.5">
          <div className="flex items-baseline gap-2.5">
            <h1 className="font-display text-lg font-bold tracking-tight text-slate-50 sm:text-3xl [@media(max-height:480px)]:text-base">
              Apex Ridge
            </h1>
            <span className="hidden text-xs text-slate-300 sm:inline [@media(max-height:480px)]:hidden">
              Alpine Canyon Time Trial
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400 sm:text-xs [@media(max-height:480px)]:hidden">
            60fps Drift Physics · Holographic Ghost Replays
          </p>
        </div>

        <div className="pointer-events-auto rounded-xl border border-white/12 bg-[#0F172A]/88 px-3 py-2 text-right shadow-xl sm:px-4 sm:py-3 [@media(max-height:480px)]:py-1.5">
          <div className="text-[10px] text-slate-400 sm:text-xs">Personal Best</div>
          <div className="font-mono-data text-sm font-semibold text-amber-400 sm:text-lg">
            {formatLapTime(activeBest)}
          </div>
          <div className="hidden text-[11px] text-slate-400 sm:block [@media(max-height:480px)]:hidden">
            {activeBest !== null ? 'Holographic Ghost Ready' : 'Finish a lap to save ghost'}
          </div>
        </div>
      </div>

      {/* Spacer keeps central sunlit 3D alpine preview visible on tall screens */}
      <div className="min-h-3 flex-1 [@media(max-height:480px)]:min-h-1" aria-hidden="true" />

      {/* Bottom Launch Dock — scrollable & compact on portrait/landscape phones */}
      <div className="pointer-events-auto mx-auto w-full max-w-5xl rounded-2xl border border-white/12 bg-[#0F172A]/92 p-3 shadow-2xl sm:p-5 [@media(max-height:480px)]:p-2.5">
        <div className="grid grid-cols-1 gap-2.5 sm:gap-4 lg:grid-cols-12">
          {/* Track Selection (7 cols) */}
          <div className="lg:col-span-7">
            <div className="mb-1.5 flex items-center justify-between gap-2 sm:mb-2">
              <h2 className="text-xs font-semibold tracking-wide text-slate-300">
                Select Course
              </h2>

              {/* Forward / Reverse Direction Toggle */}
              <div
                className="inline-flex items-center rounded-lg border border-white/10 bg-slate-900/90 p-0.5"
                role="group"
                aria-label="Track direction"
              >
                <button
                  type="button"
                  onClick={() => onSelectDirection('forward')}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    selectedDirection === 'forward'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-slate-50'
                  }`}
                >
                  Forward
                </button>
                <button
                  type="button"
                  onClick={() => onSelectDirection('reverse')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    selectedDirection === 'reverse'
                      ? 'bg-cyan-400 text-slate-950'
                      : 'text-slate-300 hover:text-slate-50'
                  }`}
                >
                  <ArrowLeftRight className="h-3 w-3" />
                  Reverse
                </button>
              </div>
            </div>

            {/* Single-row horizontal scroll on narrow/short phones, 3-col grid on sm+ */}
            <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0">
              {tracks.map((track) => {
                const isSelected = track.id === selectedTrack;
                const pb =
                  personalBests[`${track.id}:${selectedDirection}:${selectedVehicle}`] ?? null;
                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => onSelectTrack(track.id)}
                    className={`group flex min-w-[200px] shrink-0 flex-col justify-between rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 sm:min-w-0 sm:p-3 [@media(max-height:480px)]:p-2 cursor-pointer ${
                      isSelected
                        ? 'border-amber-400/80 bg-slate-800/95 text-slate-50'
                        : 'border-white/10 bg-slate-900/80 text-slate-300 hover:border-white/25 hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-display text-xs font-bold text-slate-50 truncate sm:text-sm">
                          {track.name}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                          <span
                            className={
                              track.difficulty === 'Beginner'
                                ? 'text-emerald-400 font-medium'
                                : track.difficulty === 'Intermediate'
                                ? 'text-amber-400 font-medium'
                                : 'text-rose-400 font-medium'
                            }
                          >
                            {track.difficulty}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{track.checkpointCount} CPs</span>
                        </div>
                        <div className="mt-0.5 text-[11px] tabular-nums text-slate-400">
                          {track.lengthMeters}m
                        </div>
                      </div>

                      <TrackMapSvg
                        outline={track.outline}
                        accentHex={track.accentHex}
                        selected={isSelected}
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between border-t border-white/8 pt-1.5 text-[11px] [@media(max-height:480px)]:mt-1 [@media(max-height:480px)]:pt-1">
                      <span className="text-slate-400">Best</span>
                      <span className="font-mono-data font-medium text-slate-200">
                        {formatLapTime(pb)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vehicle Selection (5 cols) */}
          <div className="lg:col-span-5">
            <div className="mb-1.5 flex items-center justify-between sm:mb-2">
              <h2 className="text-xs font-semibold tracking-wide text-slate-300">
                Select Vehicle
              </h2>
              <span className="text-[11px] text-slate-400">Live Grid Preview</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['drift-car', 'hovercraft'] as VehicleId[]).map((vId) => {
                const spec = VEHICLE_SPECS[vId];
                const isSelected = vId === selectedVehicle;
                return (
                  <button
                    key={vId}
                    type="button"
                    onClick={() => onSelectVehicle(vId)}
                    className={`flex flex-col justify-between rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 sm:p-3 [@media(max-height:480px)]:p-2 cursor-pointer ${
                      isSelected
                        ? vId === 'drift-car'
                          ? 'border-amber-400/80 bg-slate-800/95'
                          : 'border-cyan-400/80 bg-slate-800/95'
                        : 'border-white/10 bg-slate-900/80 hover:border-white/25 hover:bg-slate-800/70'
                    }`}
                  >
                    <div>
                      <div className="font-display text-xs font-bold text-slate-50 truncate sm:text-sm">
                        {spec.name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400 truncate">
                        {spec.category}
                      </div>
                    </div>

                    <div className="mt-2 space-y-0.5 border-t border-white/8 pt-1.5 text-[11px] text-slate-300 [@media(max-height:480px)]:mt-1 [@media(max-height:480px)]:pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Top Speed</span>
                        <span className="font-mono-data font-semibold text-slate-100">
                          {spec.topSpeedKmh} km/h
                        </span>
                      </div>
                      <div className="hidden items-center justify-between sm:flex [@media(max-height:480px)]:hidden">
                        <span className="text-slate-400">Drift</span>
                        <span className="truncate font-medium text-slate-200">
                          {spec.driftStyle}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sticky Footer Bar: Controls Legend (hidden on compact/touch screens) + Primary CTA */}
        <div className="sticky bottom-0 mt-3 flex flex-col items-stretch justify-between gap-2.5 border-t border-white/10 bg-[#0F172A]/95 pt-3 sm:mt-4 sm:flex-row sm:items-center sm:pt-3.5 [@media(max-height:480px)]:mt-2 [@media(max-height:480px)]:pt-2">
          {!isTouchDevice && (
            <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300 sm:flex [@media(max-height:480px)]:hidden">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Gauge className="h-3.5 w-3.5 text-slate-400" />
                <strong className="font-mono-data text-slate-100">WASD / Arrows</strong> Drive
              </span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <strong className="font-mono-data text-slate-100">Space / Shift</strong> Drift &amp; Boost
              </span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Flag className="h-3.5 w-3.5 text-cyan-400" />
                <strong className="font-mono-data text-slate-100">C</strong> Respawn ·{' '}
                <strong className="font-mono-data text-slate-100">R</strong> Restart
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={onStartRace}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 whitespace-nowrap shrink-0 sm:ml-auto sm:w-auto cursor-pointer"
          >
            <Play className="h-4 w-4 fill-current" />
            Start Race{selectedDirection === 'reverse' ? ' (Reverse)' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
