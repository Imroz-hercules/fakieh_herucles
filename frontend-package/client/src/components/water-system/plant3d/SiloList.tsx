/**
 * The list pane beside the 3D stage — the "schedule" next to the model.
 *
 * First version (DESIGN.md, Phase 1 workstream A). Phase 4 (workstream F)
 * refines the row grammar, status-colour mode and hints; this file exists so
 * the split view has something real in its right-hand pane rather than an
 * empty column, and so `SiloDetailPanel` has somewhere to live now that it no
 * longer floats over the scene.
 *
 * Sits inside `WaterSystemLayout`'s immersive stage, in the
 * `clamp(280px, 28%, 360px)` list pane on a wide viewport, or inside the
 * bottom sheet below 1100px container width (`Plant3D.tsx` decides which).
 * Either way this component does not know or care which — it always renders
 * the same KPI strip, finder and rows, sized to whatever height its parent
 * gives it.
 *
 * A plain, ungrouped `.map()` over up to 136 rows, deliberately not
 * virtualised: DESIGN.md allows "virtualised-or-cheap", and 136 simple flex
 * rows is comfortably cheap for React — no windowing dependency exists in
 * this package, and adding one for a bin count this small would be the kind
 * of mechanism this project's own history warns against building before it
 * is needed.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, Lock, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SILOS, type SiloPlacement } from '@/lib/plant3d/silos';
import {
  OUT_OF_SERVICE,
  materialColorIn,
  materialLabel,
  formatPercent,
  siloLevel,
  type SiloReadings,
} from '@/lib/plant3d/siloData';
import {
  Chip,
  MiniBar,
  SiloDetailPanel,
  ago,
  freshness,
  isStale,
  type PlantSummary,
} from './PlantHud';

/**
 * The plant's own unmonitored bins — the 500-series tanks. Read off the
 * model rather than hardcoded, so this cannot drift out of step with the
 * scene's own count: `summary.bins` is always the 131 monitored bins the KPI
 * strip's "n/131" is over, and a reader seeing "136" in the list right next
 * to a "/131" chip has no way to tell whether that is a typo or a different
 * population, unless the list says so itself.
 */
const NOT_MONITORED_COUNT = SILOS.filter((s) => !s.group.monitored).length;

export interface SiloListProps {
  /** the bins visible in the current zone — same set the scene draws, so the
      list and the model never disagree about what "this zone" means. */
  placements: SiloPlacement[];
  readings: SiloReadings;
  summary: PlantSummary;
  selected: number | null;
  hovered: number | null;
  onHover: (n: number | null) => void;
  /** jump to a bin by number — the existing `findSilo`: selects it, frames
      the camera on it, and returns false when no such bin exists. Used by
      both a row click and the finder's Enter/submit. */
  onFind: (siloNo: number) => boolean;
  onGoToAlarm: (which: 'high' | 'locked') => void;
  /** clears the selection — closes the expanded row. */
  onDeselect: () => void;
}

/**
 * A one-line, right-aligned relative time for the row's own "updated"
 * column — "8 d", "19 h", "2 min", "45s" — never "8 days ago". The exported
 * `ago()` from PlantHud.tsx is the right format for a sentence (the KPI
 * strip's "plant wrote 2 min ago"), and the wrong one for a fixed-width
 * table column: at the laptop's own width that column measured too narrow
 * for "8 days ago" and the words wrapped onto a second line, which grew
 * every stale row taller than every fresh one and pushed the rest of the
 * list down with it.
 */
function agoShort(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} d`;
}

/** 6px fill bar in the material colour; a diagonal hatch on the empty track
    when the bin has no level to show at all (400 series, unmonitored). Inline
    style rather than a Tailwind class: this app's `light:` set is a fixed,
    hand-written list (scripts/verify-plant3d.mjs scans for exactly that), and
    a one-off gradient has no business claiming a slot in it. */
function FillBar({ fill, color }: { fill: number | null; color: string }) {
  return (
    <span
      className="block h-1.5 w-full shrink-0 overflow-hidden rounded-sm bg-slate-800 light:bg-gray-200"
      style={
        fill === null
          ? {
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(148,163,184,0.35) 0, rgba(148,163,184,0.35) 2px, transparent 2px, transparent 4px)',
            }
          : undefined
      }
    >
      {fill !== null && fill > 0 && (
        <span
          className="block h-full rounded-sm"
          style={{ width: `${Math.max(1.5, Math.min(100, fill * 100))}%`, backgroundColor: color }}
        />
      )}
    </span>
  );
}

export function SiloList({
  placements,
  readings,
  summary,
  selected,
  hovered,
  onHover,
  onFind,
  onGoToAlarm,
  onDeselect,
}: SiloListProps) {
  const [query, setQuery] = useState('');
  const [missing, setMissing] = useState(false);

  const fresh = freshness(readings.plantWroteAt, readings.fetchedAt, readings.error);
  const notLive = fresh.tone === 'bg-red-500';
  const capacityFraction = summary.capacityKg ? (summary.tonnes * 1000) / summary.capacityKg : null;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const withInfo = placements.map((p) => {
      const reading = readings.byNo.get(p.siloNo);
      const level = siloLevel(p, reading);
      const material = materialLabel(reading);
      const color = materialColorIn(readings.palette, reading?.materialCode);
      /* Same guard as Plant3D.tsx's own `known` calc: materialCode is typed
         string | null and the API sends numbers, so a bare `.trim()` on it
         is the exact crash that once blanked this whole page. */
      const code = String(reading?.materialCode ?? '').trim();
      const untagged = code === '' || code === OUT_OF_SERVICE;
      const stale = isStale(reading?.updatedAt);
      return { p, reading, level, material, color, untagged, stale };
    });
    const filtered = q
      ? withInfo.filter(
          (r) => String(r.p.siloNo).startsWith(q) || r.material.toLowerCase().includes(q),
        )
      : withInfo;
    /* Alarms first, then silo number — DESIGN.md's default sort. */
    const sorted = [...filtered].sort((a, b) => {
      const aAlarm = a.reading?.hlActive || a.reading?.lockActive ? 0 : 1;
      const bAlarm = b.reading?.hlActive || b.reading?.lockActive ? 0 : 1;
      if (aAlarm !== bAlarm) return aAlarm - bAlarm;
      return a.p.siloNo - b.p.siloNo;
    });
    /* The selected row stays pinned to the top of the list while selected,
       regardless of where the sort would otherwise put it. */
    if (selected !== null) {
      const at = sorted.findIndex((r) => r.p.siloNo === selected);
      if (at > 0) {
        const [row] = sorted.splice(at, 1);
        sorted.unshift(row);
      }
    }
    return sorted;
  }, [placements, readings.byNo, readings.palette, query, selected]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed === '') return;
    const n = Number(trimmed);
    if (!Number.isInteger(n)) {
      /* Not a number — if the live filter above already narrowed it to one
         bin, Enter goes to that one rather than doing nothing. */
      if (rows.length === 1) {
        onFind(rows[0].p.siloNo);
        setMissing(false);
        setQuery('');
      }
      return;
    }
    if (!onFind(n)) {
      setMissing(true);
      return;
    }
    setMissing(false);
    setQuery('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ---- KPI strip -------------------------------------------------- */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-slate-800 p-3 light:border-gray-200">
        {/*
          The list's own header line. This row holds all 136 placed bins —
          131 monitored plus the 5 unmonitored 500-series tanks, rendered
          below as "Not monitored" — while every count elsewhere on this
          screen (the "n/131" chip two rows down included) is over the 131
          monitored bins alone. Stated once, up front, so "136" here and
          "131" there read as two different populations rather than as one
          of them being wrong.
        */}
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 light:text-gray-500">
          {summary.bins} monitored · {NOT_MONITORED_COUNT} tanks not in the feed
        </p>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'h-2.5 w-2.5 shrink-0 rounded-full',
              fresh.tone,
              readings.isLoading && 'animate-pulse',
            )}
            title={fresh.label}
            aria-hidden="true"
          />
          {readings.plantWroteAt ? (
            <time
              dateTime={readings.plantWroteAt.toISOString()}
              title={readings.plantWroteAt.toISOString()}
              className="truncate text-[11px] text-slate-400 light:text-gray-600"
            >
              plant wrote {ago((Date.now() - readings.plantWroteAt.getTime()) / 1000)}
            </time>
          ) : (
            <span className="truncate text-[11px] text-slate-500 light:text-gray-500">
              waiting for data
            </span>
          )}
        </div>

        {/* Persistent, not a chip that can scroll off — the one signal saying
            nothing else on this screen is current has to survive every
            layout this pane runs under. */}
        {notLive && (
          <p
            className="text-[11px] font-semibold text-red-400 light:text-red-600"
            role="status"
          >
            {fresh.label}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="flex items-baseline gap-1.5">
            <span className="font-mono text-[15px] font-semibold leading-none tabular-nums text-white light:text-gray-900">
              {Math.round(summary.tonnes).toLocaleString('en-GB')}
            </span>
            <span className="text-[10px] leading-none text-slate-500 light:text-gray-500">
              t on site
            </span>
            {capacityFraction !== null && (
              <MiniBar
                fraction={capacityFraction}
                title={`${formatPercent(capacityFraction)} of site capacity held`}
              />
            )}
          </span>

          <span className="flex items-center gap-1.5">
            <span className="flex items-baseline gap-0.5 font-mono text-[11px] leading-none tabular-nums text-slate-300 light:text-gray-700">
              {summary.withStock}
              <span className="text-slate-600 light:text-gray-500">/{summary.bins}</span>
            </span>
            <MiniBar
              fraction={summary.bins ? summary.withStock / summary.bins : 0}
              title={`${summary.withStock} of ${summary.bins} monitored bins hold stock`}
            />
          </span>

          {summary.highLevel > 0 && (
            <Chip
              tone="amber"
              title={`${summary.highLevel} bin(s) reporting high level — press to go to them`}
              onClick={() => onGoToAlarm('high')}
            >
              <AlertTriangle className="h-3 w-3" />
              {summary.highLevel}
            </Chip>
          )}
          {summary.locked > 0 && (
            <Chip
              tone="red"
              title={`${summary.locked} bin(s) locked — press to go to them`}
              onClick={() => onGoToAlarm('locked')}
            >
              <Lock className="h-3 w-3" />
              {summary.locked}
            </Chip>
          )}
        </div>
      </div>

      {/* ---- finder ------------------------------------------------------ */}
      <form
        onSubmit={submit}
        className={cn(
          'flex shrink-0 items-center gap-1.5 border-b border-slate-800 px-3 light:border-gray-200',
          'focus-within:bg-slate-900/40',
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-slate-500 light:text-gray-500" />
        <label htmlFor="silo-list-finder" className="sr-only">
          Find a bin by number or material
        </label>
        <input
          id="silo-list-finder"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setMissing(false);
          }}
          placeholder="Find a bin or material"
          className={cn(
            'touch-target-44 min-h-[32px] w-full bg-transparent text-xs text-slate-200 outline-none',
            'placeholder:text-slate-500 light:text-gray-800',
          )}
          aria-invalid={missing}
        />
        {missing && (
          <span className="shrink-0 text-[10px] text-red-400" role="status">
            no such bin
          </span>
        )}
      </form>

      {/* ---- rows --------------------------------------------------------- */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 && (
          <p className="p-3 text-[11px] text-slate-500 light:text-gray-500">
            No bin or material matches “{query}”.
          </p>
        )}
        {rows.map(({ p, reading, level, material, color, untagged, stale }) => {
          const isSelected = selected === p.siloNo;
          const isHovered = hovered === p.siloNo;
          const notMonitored = level.reason === 'not-monitored';
          return (
            <div
              key={p.siloNo}
              className={cn(
                'border-b border-slate-800/60 light:border-gray-200',
                isSelected && 'bg-slate-900/60 light:bg-gray-50',
              )}
            >
              <button
                type="button"
                onMouseEnter={() => onHover(p.siloNo)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(p.siloNo)}
                onBlur={() => onHover(null)}
                onClick={() => onFind(p.siloNo)}
                aria-pressed={isSelected}
                className={cn(
                  'touch-target-44 flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                  'hover:bg-slate-900/40 light:hover:bg-gray-50',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400',
                  isHovered && !isSelected && 'bg-slate-900/30 light:bg-gray-50',
                )}
              >
                <span className="w-9 shrink-0 font-mono text-xs tabular-nums text-slate-300 light:text-gray-700">
                  {p.siloNo}
                </span>
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/20"
                  style={{ backgroundColor: notMonitored ? '#475569' : color }}
                />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-300 light:text-gray-700">
                  {notMonitored ? 'Not monitored' : material}
                </span>
                <span className="w-10 shrink-0">
                  <FillBar fill={level.fill} color={color} />
                </span>
                <span className="w-8 shrink-0 whitespace-nowrap text-right font-mono text-[11px] tabular-nums text-slate-400 light:text-gray-600">
                  {formatPercent(level.fraction)}
                </span>
                <span
                  className={cn(
                    'w-8 shrink-0 whitespace-nowrap text-right font-mono text-[10px] tabular-nums',
                    stale ? 'text-red-400 light:text-red-600' : 'text-slate-500 light:text-gray-500',
                  )}
                >
                  {reading?.updatedAt
                    ? agoShort((Date.now() - Date.parse(reading.updatedAt)) / 1000)
                    : '—'}
                </span>
                <span className="flex w-9 shrink-0 items-center justify-end gap-1">
                  {reading?.hlActive && (
                    <AlertTriangle
                      className="h-3 w-3 shrink-0 text-amber-400"
                      aria-label="High level"
                    />
                  )}
                  {reading?.lockActive && (
                    <Lock className="h-3 w-3 shrink-0 text-red-400" aria-label="Locked" />
                  )}
                  {level.outOfRange && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                      title="Out of range"
                      aria-label="Out of range"
                    />
                  )}
                  {untagged && !notMonitored && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500"
                      title="Untagged bin"
                      aria-label="Untagged"
                    />
                  )}
                </span>
              </button>

              {isSelected && (
                /* Capped rather than free to grow: an expanded row that ran
                   past the list's own visible height would push every other
                   row out of reach with no way back to them short of
                   collapsing this one first. `max-h-[60vh]` with its own
                   scroll keeps the rest of the list one scroll away instead. */
                <div className="max-h-[60vh] overflow-y-auto border-t border-slate-800/60 bg-slate-950/40 px-3 py-3 light:border-gray-200 light:bg-gray-50">
                  <SiloDetailPanel
                    placement={p}
                    reading={reading}
                    group={p.group}
                    palette={readings.palette}
                    onClose={onDeselect}
                    embedded
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
