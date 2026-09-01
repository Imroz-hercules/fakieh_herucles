/**
 * Screen furniture for the 3D plant view.
 *
 * Everything here floats over the canvas rather than sitting above it, so the
 * scene keeps the full height of a short laptop screen and the controls stay
 * within reach of what they control.
 *
 * WHO IT IS FOR
 * -------------
 * Plant operators and their manager, on a 1280x720 laptop, glancing rather than
 * reading. So: a number, a colour or a bar wherever one will do, and words only
 * where they carry something the picture cannot. Provenance and caveats are all
 * still here and all still honest — they live one hover away instead of taking
 * up the screen every second of every shift.
 *
 * THE LOOK
 * --------
 * The scene is going neutral cool grey; material colour is the only chroma in
 * it. This chrome follows: near-black or near-white surfaces, a single cyan
 * accent reserved for "selected/active", and every other colour reserved for
 * something the data actually means (an alarm, a material, a fill level). Two
 * registers, not one flat card style: the zone switcher carries no card at all
 * and rhymes with the floating zone labels drawn in the scene it controls —
 * it is wayfinding, not an instrument. Status and the material key are the
 * two surfaces that read the plant's own numbers, so they carry a little more
 * weight (CARD_PRIMARY) than a control cluster (CARD). Every card is a hairline
 * border and a soft shadow now, not the near-black slab this used to be —
 * three of those stacked read as debug panels; one quiet grammar reads as one
 * instrument.
 *
 * ONE THING TO KNOW BEFORE EDITING
 * --------------------------------
 * `index.css` carries `:root.light button[class*="light:bg-"] { background-color:
 * inherit !important }` (and the same for text and border). Any `light:` class
 * put directly on a <button> in this app is therefore silently cancelled in light
 * mode. Every control below keeps its visual classes on an inner <span>, which
 * that rule does not match. Do not "simplify" them back onto the button.
 */
import { useEffect, useId, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Info,
  Lock,
  Maximize2,
  Minimize2,
  Moon,
  RefreshCw,
  Search,
  Settings2,
  Sun,
  Tag,
  Sunset,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BULK_DENSITY_T_PER_M3,
  SILOS,
  VERTICAL_EXAGGERATION,
  formatCapacity,
  type SiloPlacement,
  type SiloGroupSpec,
} from '@/lib/plant3d/silos';
import {
  formatKg,
  formatPercent,
  materialColorIn,
  materialLabel,
  siloLevel,
  type MaterialPalette,
  type NoLevelReason,
  type SiloReading,
} from '@/lib/plant3d/siloData';
import type { Zone, ZoneId } from '@/lib/plant3d/site';

export type TimeOfDay = 'day' | 'dusk' | 'night';
export type Quality = 'auto' | 'high' | 'low';

/** Control surfaces: a hairline edge, a soft shadow, nothing heavier. Present,
    quiet, never competing with the scene for the eye. */
const CARD =
  'rounded-md border border-slate-800 bg-slate-950/90 shadow-sm backdrop-blur-md ' +
  'light:border-gray-200 light:bg-white/90 light:shadow-sm';

/** The two surfaces that read the plant's own numbers — status and the
    material key — carry a little more weight than a control cluster, without
    going back to the near-black slab this used to be. */
const CARD_PRIMARY =
  'rounded-md border border-slate-700 bg-slate-950/95 shadow-md backdrop-blur-md ' +
  'light:border-gray-300 light:bg-white/95 light:shadow-md';

/**
 * The bins a material code could ever be reported for.
 *
 * Read off the model rather than passed in as a prop, so this denominator
 * cannot drift away from the scene it describes.
 *
 * `monitored`, not `SILOS.length`, and the difference is not cosmetic: the
 * model draws 136 bins and this counts 131. The five missing ones are the 500
 * series, the only unmonitored group, which the plant runs soya oil through
 * but reports nothing about. Every other count on this screen — the zone tabs,
 * the status bar's "n / 131" — is already computed over `monitored` bins, so
 * a legend quoting 136 would be the single number on the page disagreeing with
 * all the others, and a reader would have no way to tell which was wrong.
 *
 * It is also the more honest population for THIS statement. Saying "10 of 136
 * tagged" implies five bins could carry a material code and do not; they
 * cannot, because nothing upstream reports on them at all. That is a different
 * fact and it belongs in the provenance note, not in this ratio.
 */
const TOTAL_BINS = SILOS.filter((s) => s.group.monitored).length;

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

/**
 * A toggle.
 *
 * Sized to a 32px minimum box: WCAG 2.2 asks for 24px and the previous 26px
 * cleared it by two pixels, which a line-height rounding difference could have
 * eaten. These get pressed by people in a hurry.
 */
function Pill({
  active,
  onClick,
  title,
  label,
  children,
  className,
  floating,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  label?: string;
  children: React.ReactNode;
  className?: string;
  /**
   * No card underneath this pill — it sits directly over the 3D view, so it
   * carries its own backdrop rather than borrowing one from a container.
   * Used by the zone switcher, which is deliberately styled to rhyme with
   * the floating zone labels drawn in the scene it controls, rather than
   * with the instrument panels around it.
   */
  floating?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={label ?? title}
      aria-pressed={active}
      className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
    >
      <span
        className={cn(
          'flex min-h-[32px] items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors',
          floating && 'shadow-sm backdrop-blur-md',
          active
            ? /*
               * A floating pill has no card behind it — it composites straight
               * onto the 3D scene — so a 25% fill is not a colour, it is a tint
               * of whatever sky happens to be behind it. The selected zone chip
               * measured 1.6:1 against the day sky and 2.1:1 at night, in DARK
               * theme, which is the client's own setting, on the default view,
               * as the first thing anyone sees. The inactive branch below
               * already splits on `floating` for exactly this reason; this one
               * did not. Opaque enough to be a chip: 9.8:1 over the palest sky.
               */
              floating
              ? 'bg-cyan-500/80 text-slate-950 light:bg-cyan-100 light:text-cyan-700'
              : 'bg-cyan-500/25 text-cyan-200 light:bg-cyan-100 light:text-cyan-700'
            : floating
              ? 'bg-slate-950/70 text-slate-300 hover:bg-slate-900/90 ' +
                  'light:bg-white/90 light:text-gray-700 light:hover:bg-gray-100'
              : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100 ' +
                  'light:text-gray-500 light:hover:bg-gray-100 light:hover:text-gray-900',
          className,
        )}
      >
        {children}
      </span>
    </button>
  );
}

const DIVIDER = 'mx-1 h-5 w-px bg-slate-700 light:bg-gray-200';

export function ZoneBar({
  zones,
  zone,
  counts,
  onSelect,
  compact,
}: {
  zones: Zone[];
  zone: ZoneId | 'all';
  counts: Record<string, number>;
  onSelect: (z: ZoneId | 'all') => void;
  /* On a short screen the cards start costing more canvas than they are worth,
     so the zone names drop to their short forms rather than wrapping to a
     second row and taking another 36px off the view. */
  compact?: boolean;
}) {
  return (
    /*
     * No enclosing card. Each pill carries its own backdrop (see Pill's
     * `floating` prop), so removing the wrapper costs no legibility and this
     * reads as a row of wayfinding markers rather than another dark slab
     * stacked over the status card below it.
     *
     * It USED to say: one row that scrolls, never a column that grows, because
     * wrapping turned six pills into a tall stack at 638px wide. That fear was
     * real and the remedy was wrong, and a tablet screenshot showed why: at
     * 1024x768 the row scrolled "Finished" — the largest zone on the plant, 48
     * bins — clean off the end, behind a hidden scrollbar, on a touch screen
     * with nothing to say it was there. A zone an operator cannot see is a zone
     * they will not look in.
     *
     * `flex-wrap` is the honest version of the same intent. It costs exactly
     * nothing while the pills fit — the laptop still shows one row — and it
     * grows only in the case where the alternative was concealing a control.
     * Plant3D.tsx already states this rule outright about the top HUD: "a
     * control you cannot see is worse than a control that costs a little
     * height." The two comments contradicted each other; this one was wrong.
     */
    <div className="flex max-w-full flex-wrap items-center gap-1.5">
      <Pill
        floating
        active={zone === 'all'}
        onClick={() => onSelect('all')}
        title="Frame the whole site"
      >
        {compact ? 'All' : 'Whole site'}
      </Pill>
      {zones.map((z) => (
        <Pill
          key={z.id}
          floating
          active={zone === z.id}
          onClick={() => onSelect(z.id)}
          title={z.description}
        >
          {compact ? z.short : z.label}
          <span
            className={cn(
              'rounded px-1 font-mono text-[10px]',
              zone === z.id
                ? 'bg-cyan-400/20 text-cyan-200 light:bg-cyan-100 light:text-cyan-700'
                : 'bg-slate-800/80 text-slate-400 light:bg-gray-100 light:text-gray-500',
            )}
          >
            {counts[z.id] ?? 0}
          </span>
        </Pill>
      ))}
    </div>
  );
}

export function LookBar({
  timeOfDay,
  onTimeOfDay,
  ghosted,
  onGhosted,
  expanded,
  onExpanded,
  diagnostics,
  onDiagnostics,
  numbers,
  onNumbers,
}: {
  timeOfDay: TimeOfDay;
  onTimeOfDay: (t: TimeOfDay) => void;
  ghosted: boolean;
  onGhosted: (g: boolean) => void;
  expanded: boolean;
  onExpanded: (e: boolean) => void;
  diagnostics: boolean;
  onDiagnostics: (d: boolean) => void;
  numbers: boolean;
  onNumbers: (v: boolean) => void;
}) {
  const times: [TimeOfDay, typeof Sun, string][] = [
    ['day', Sun, 'Daylight'],
    ['dusk', Sunset, 'Dusk'],
    ['night', Moon, 'Night'],
  ];
  return (
    <div className={cn(CARD, 'flex items-center gap-1 px-1 py-0.5')}>
      {times.map(([t, Icon, title]) => (
        <Pill key={t} active={timeOfDay === t} onClick={() => onTimeOfDay(t)} title={title}>
          <Icon className="h-4 w-4" />
        </Pill>
      ))}
      <span className={DIVIDER} />
      {/*
        One icon that lights up when on, rather than an Eye/EyeOff pair. The eye
        pair reads backwards here: everywhere else a crossed-out eye means the
        thing is hidden, but the state where these buildings are most visible is
        the one where you are NOT seeing through them.
      */}
      <Pill
        active={ghosted}
        onClick={() => onGhosted(!ghosted)}
        title="See inside the buildings"
        label="See inside the buildings"
      >
        <Building2 className="h-4 w-4" />
      </Pill>
      <Pill
        active={expanded}
        onClick={() => onExpanded(!expanded)}
        title={expanded ? 'Exit full screen (Esc)' : 'Fill the screen'}
        label="Toggle full screen"
      >
        {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </Pill>
      {/*
        Sits with the view toggles rather than in the diagnostics cluster: it
        changes what the picture SAYS, the way ghosting the buildings does, not
        how it is rendered. Silo numbers are the operator's own vocabulary — on
        the floor the bins are called 312 and 806, not "third from the left".
      */}
      <Pill
        active={numbers}
        onClick={() => onNumbers(!numbers)}
        title="Show silo numbers"
        label="Show silo numbers"
      >
        <Tag className="h-4 w-4" />
      </Pill>
      <Pill
        active={diagnostics}
        onClick={() => onDiagnostics(!diagnostics)}
        title="Rendering diagnostics"
        label="Toggle rendering diagnostics"
      >
        <Settings2 className="h-4 w-4" />
      </Pill>
    </div>
  );
}

/**
 * Frame rate, draw calls and graphics quality.
 *
 * Off by default. None of it means anything to someone running a feed mill, and
 * on a 495px-tall screen every card has to earn its place. It stays available
 * because it is what proves the thing actually runs on the hardware in the room.
 */
export function DiagnosticsBar({
  statsRef,
  quality,
  onQuality,
  software,
  degraded,
}: {
  statsRef: React.RefObject<HTMLSpanElement>;
  quality: Quality;
  onQuality: (q: Quality) => void;
  software: boolean;
  /** the page dropped its effects to keep frame rate */
  degraded: boolean;
}) {
  return (
    <div className={cn(CARD, 'flex items-center gap-1 px-1 py-0.5 pl-2.5')}>
      {degraded && (
        <>
          <Chip
            tone="amber"
            title="This machine could not hold frame rate with ambient occlusion and bloom on, so they were switched off automatically. Nothing about the data is affected."
          >
            effects off
          </Chip>
          <span className={DIVIDER} />
        </>
      )}
      <span
        ref={statsRef}
        className="font-mono text-[10px] tabular-nums text-slate-500 light:text-gray-500"
      >
        measuring…
      </span>
      <span className={DIVIDER} />
      {(['auto', 'high', 'low'] as Quality[]).map((q) => (
        <Pill
          key={q}
          active={quality === q}
          onClick={() => onQuality(q)}
          title={
            q === 'auto'
              ? software
                ? 'Auto — no GPU detected here, so the cheap path is in use'
                : 'Auto — full quality on this machine'
              : q === 'high'
                ? 'Force shadows and antialiasing on'
                : 'Force the cheap path'
          }
          className="px-2.5"
        >
          {q}
        </Pill>
      ))}
    </div>
  );
}

/**
 * Jump to a bin by number.
 *
 * Operators do not think "third from the left in the middle row" — every screen
 * they already use is indexed by silo number, and the finished-feed store is
 * forty-eight identical bins. Typing 812 and landing on it is the difference
 * between this being a picture of the plant and being a tool.
 */
export function SiloFinder({
  onFind,
  compact,
}: {
  /** returns false when there is no such bin */
  onFind: (siloNo: number) => boolean;
  compact?: boolean;
}) {
  const [value, setValue] = useState('');
  const [missing, setMissing] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(value.trim());
    if (!Number.isInteger(n) || !onFind(n)) {
      setMissing(true);
      return;
    }
    setMissing(false);
    setValue('');
  };

  return (
    <form
      onSubmit={submit}
      className={cn(
        CARD,
        'flex items-center gap-1 px-1.5 py-0.5',
        /* The input clears its own outline, so the ring goes on the wrapper —
           otherwise tabbing into the finder gives no visible focus at all. */
        'focus-within:ring-2 focus-within:ring-cyan-400',
      )}
    >
      <label htmlFor="silo-finder" className="sr-only">
        Go to silo number
      </label>
      <Search className="ml-1 h-3.5 w-3.5 shrink-0 text-slate-500 light:text-gray-500" />
      <input
        id="silo-finder"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setMissing(false);
        }}
        inputMode="numeric"
        placeholder={compact ? 'Silo' : 'Silo no.'}
        aria-invalid={missing}
        className={cn(
          'min-h-[32px] w-16 bg-transparent px-1 font-mono text-xs tabular-nums outline-none',
          'text-slate-200 placeholder:text-slate-500',
          /* No light:placeholder:* exists in this app's hand-written set, so the
             dark-theme placeholder colour is left to serve both themes; slate-500
             reads correctly on white. */
          'light:text-gray-800',
          missing && 'text-red-400',
        )}
      />
      {missing && (
        <span className="pr-1.5 text-[10px] text-red-400" role="status">
          no such bin
        </span>
      )}
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export interface PlantSummary {
  bins: number;
  /** total held across every bin that reports a level, tonnes */
  tonnes: number;
  withStock: number;
  highLevel: number;
  locked: number;
  noLevel: number;
  /**
   * Total capacity of every monitored, metered bin, kg. Optional and additive:
   * a caller that has not computed it simply gets the tonnage as a number with
   * no gauge under it, rather than a crash or a misleading empty bar.
   */
  capacityKg?: number;
}

const CHIP_TONES = {
  amber: 'bg-amber-500/20 text-amber-300 light:bg-orange-100 light:text-orange-600',
  red: 'bg-red-500/20 text-red-300 light:bg-red-100 light:text-red-600',
  slate: 'bg-slate-700/40 text-slate-400 light:bg-gray-100 light:text-gray-600',
  cyan: 'bg-cyan-500/20 text-cyan-300 light:bg-cyan-100 light:text-cyan-700',
  green: 'bg-green-500/20 text-green-400 light:bg-green-100 light:text-green-700',
} as const;

const CHIP_BASE =
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold';

function Chip({
  tone,
  children,
  title,
  onClick,
}: {
  tone: keyof typeof CHIP_TONES;
  children: React.ReactNode;
  title?: string;
  /** when given, the chip becomes a control that goes to what it counts */
  onClick?: () => void;
}) {
  if (!onClick) {
    return (
      <span title={title} className={cn(CHIP_BASE, CHIP_TONES[tone])}>
        {children}
      </span>
    );
  }
  /*
   * A count of alarms that cannot be acted on is a puzzle, not information.
   * Pressing it goes to the bin — repeatedly, when there is more than one.
   */
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
    >
      <span className={cn(CHIP_BASE, CHIP_TONES[tone], 'min-h-[24px] cursor-pointer hover:brightness-125')}>
        {children}
        {/* Hover is not an affordance on a plant-floor touch panel, and it is
            invisible in a screenshot. One glyph says "this leads somewhere"
            before anyone touches it, and costs no words. */}
        <ChevronRight className="h-2.5 w-2.5 opacity-70" />
      </span>
    </button>
  );
}

/**
 * Neutral mid-tone that reads correctly on both a dark and a light card — an
 * explicit hex rather than a `light:` class, for the same reason MiniSilo
 * below uses one: this app's hand-written `light:` set has no bg-gray-400 or
 * similar to reach for. Used only for gauges that are not a material and not
 * an alarm, so it must not borrow either colour's meaning.
 */
const GAUGE_FILL = '#94a3b8';

/**
 * A thin proportion bar — a number lands faster as a shape than as a
 * sentence. Sized to add no height of its own to the row it sits in; the
 * text beside it is always taller.
 */
function MiniBar({ fraction, title }: { fraction: number; title?: string }) {
  const pct = Number.isFinite(fraction) ? Math.max(0, Math.min(100, fraction * 100)) : 0;
  return (
    <span
      className="h-1.5 w-8 shrink-0 overflow-hidden rounded-sm bg-slate-800 light:bg-gray-200"
      title={title}
    >
      <span className="block h-full rounded-sm" style={{ width: `${pct}%`, backgroundColor: GAUGE_FILL }} />
    </span>
  );
}

function ago(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)}s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} days ago`;
}

/**
 * Freshness as a colour, not a clock someone has to do arithmetic on.
 *
 * Measured from when the PLANT last wrote a value, not from when this browser
 * last made a request. Those come apart: the demo database answers instantly
 * with numbers it has not changed in six days, and an indicator keyed to the
 * HTTP round trip would have called that "live".
 */
function freshness(plantWroteAt: Date | null, fetchedAt: Date | null, error: Error | null) {
  /* Both clocks, because they fail differently and the difference is the
     diagnosis: a stale plant clock with a fresh fetch clock means the PLC poll
     has stopped, not that the network is down. */
  const checked = fetchedAt ? ` · last checked ${ago((Date.now() - fetchedAt.getTime()) / 1000)}` : '';
  if (error) {
    return { tone: 'bg-red-500', label: `Cannot reach the plant — nothing here is current${checked}` };
  }
  if (!plantWroteAt) return { tone: 'bg-slate-600', label: `Waiting for data${checked}` };
  const age = (Date.now() - plantWroteAt.getTime()) / 1000;
  if (age < 120) return { tone: 'bg-green-500', label: `Live — plant wrote ${ago(age)}${checked}` };
  if (age < 900) {
    return { tone: 'bg-amber-400', label: `Slow — plant last wrote ${ago(age)}${checked}` };
  }
  return { tone: 'bg-red-500', label: `NOT LIVE — plant last wrote ${ago(age)}${checked}` };
}

/**
 * The one card that answers "is anything wrong, and is this live" in a glance.
 * Heavier than the control clusters, on purpose.
 */
export function StatusBar({
  summary,
  zoneLabel,
  unknownRows,
  plantWroteAt,
  fetchedAt,
  loading,
  error,
  onRefresh,
  onGoTo,
}: {
  summary: PlantSummary;
  zoneLabel: string;
  /** rows the plant sent for silo numbers this view has no model for */
  unknownRows: number;
  plantWroteAt: Date | null;
  fetchedAt: Date | null;
  loading: boolean;
  error: Error | null;
  onRefresh: () => void;
  /** go to the next bin in a named set; used by the alarm counts */
  onGoTo: (which: 'high' | 'locked') => void;
}) {
  /*
   * Age has to keep moving between polls, or a screen left open overnight sits
   * on a green dot from the last render. Only this card re-renders.
   */
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 10_000);
    return () => window.clearInterval(t);
  }, []);

  const fresh = freshness(plantWroteAt, fetchedAt, error);
  const alarms = summary.highLevel + summary.locked;
  const notLive = fresh.tone === 'bg-red-500';
  const capacityFraction = summary.capacityKg ? (summary.tonnes * 1000) / summary.capacityKg : null;

  return (
    <div
      className={cn(
        CARD_PRIMARY,
        /*
         * Wraps rather than scrolling, for a sharper reason than the zone bar.
         * The chips are ordered least-to-most alarming, so the ones that fall
         * off the end of a nowrap row are the WARNINGS: on a 1024x768 tablet
         * the "Not live" chip disappeared entirely, which means the one signal
         * telling an operator that nothing on this screen is current was the
         * first thing the layout threw away. Every other number on the page is
         * only meaningful if that chip is visible.
         */
        'flex max-w-full flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-1.5',
      )}
      /* The zone name used to sit in its own chip at the end of this bar,
         repeating what the zone switcher right above it already shows —
         gone now, but not lost: anyone on a screen reader does not see that
         switcher's highlighted pill, so it moves here as the bar's name
         instead of taking up width every shift. */
      aria-label={`Plant status — ${zoneLabel}`}
    >
      <span
        className={cn('h-2.5 w-2.5 shrink-0 rounded-full', fresh.tone, loading && 'animate-pulse')}
        title={fresh.label}
        aria-label={fresh.label}
      />

      <span className="flex shrink-0 items-center gap-1.5">
        <span className="flex items-baseline gap-1">
          <span className="font-mono text-sm font-semibold leading-none tabular-nums text-white light:text-gray-900">
            {Math.round(summary.tonnes).toLocaleString('en-GB')}
          </span>
          <span className="text-[10px] leading-none text-slate-500 light:text-gray-500">t</span>
        </span>
        {capacityFraction !== null && (
          <MiniBar
            fraction={capacityFraction}
            title={`${formatPercent(capacityFraction)} of site capacity held`}
          />
        )}
      </span>

      <span className={DIVIDER} />

      <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
        <span className="flex items-baseline gap-0.5 font-mono text-[11px] leading-none tabular-nums text-slate-300 light:text-gray-700">
          {summary.withStock}
          <span className="text-slate-600 light:text-gray-500">/{summary.bins}</span>
        </span>
        <MiniBar
          fraction={summary.bins ? summary.withStock / summary.bins : 0}
          title={`${summary.withStock} of ${summary.bins} monitored bins hold stock`}
        />
      </span>

      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {summary.highLevel > 0 && (
          <Chip
            tone="amber"
            title={`${summary.highLevel} bin(s) reporting high level — press to go to them`}
            onClick={() => onGoTo('high')}
          >
            <AlertTriangle className="h-3 w-3" />
            {summary.highLevel}
          </Chip>
        )}
        {summary.locked > 0 && (
          <Chip
            tone="red"
            title={`${summary.locked} bin(s) locked — press to go to them`}
            onClick={() => onGoTo('locked')}
          >
            <Lock className="h-3 w-3" />
            {summary.locked}
          </Chip>
        )}
        {unknownRows > 0 && (
          <Chip
            tone="amber"
            title={`The plant reported ${unknownRows} bin(s) this view has no model for. They are excluded from every figure here.`}
          >
            +{unknownRows}
          </Chip>
        )}
        {notLive && (
          <Chip tone="red" title={fresh.label}>
            <AlertTriangle className="h-3 w-3" />
            Not live
          </Chip>
        )}
        {alarms === 0 && !error && !notLive && (
          <Chip tone="green" title="No bin is reporting a high level or a lock">
            <CheckCircle2 className="h-3 w-3" />
            <span className="sr-only">All normal</span>
          </Chip>
        )}
        {error && (
          <button
            type="button"
            onClick={onRefresh}
            className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <span className="inline-flex min-h-[24px] items-center gap-1 rounded-full bg-red-500/20 px-2 text-[11px] font-semibold text-red-300 light:bg-red-100 light:text-red-600">
              <RefreshCw className="h-3 w-3" />
              Retry
            </span>
          </button>
        )}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Material key                                                        */
/* ------------------------------------------------------------------ */

/*
 * The density is read from the model rather than typed here. It was written out
 * as a bare 0.75 in two places, which is the same duplicated-constant mistake
 * that let the hopper geometry and the hopper arithmetic disagree by 15%.
 */
const PROVENANCE = [
  `Sizes are derived, not surveyed. Height comes from capacity divided by one bulk density (${BULK_DENSITY_T_PER_M3} t/m3) applied to every bin whatever it holds; the diameter is assumed and the height follows from it. Counts, capacities, materials and the raw quantity are all the plant’s own.`,
  'Nothing here is drawn to scale. Every height is stretched 1.55x so the site reads at a glance, and every bin on the site — indoors and outdoors alike — is drawn on a compressed size scale keyed to its capacity, so a 100 kg hopper stays visible next to the plant’s biggest silos (the 1,600 t 100 and 200 series, which is the one capacity this never enlarges). The smallest bins are additionally floored at 1.3 m across, so the 900 series is no longer even in true size order against itself.',
  `The material surface assumes that same ${BULK_DENSITY_T_PER_M3} t/m3. A bin full of something lighter — bran is nearer a third of it — will read low, so treat the shaded level as a proportion of rated tonnage rather than as a true physical surface.`,
  'The 400 series has no level. There is no quantity address in the PLC for those bins, so they are never shaded, whatever number the database happens to hold.',
  'Most bins are not colour-coded, and that is the data rather than a fault in the drawing. Only the bins the plant reports a material code for are given a material colour; every other bin is drawn as a neutral vessel rather than being assigned a colour for contents nobody has stated. The count beside the material key says how many of the bins on site are tagged.',
  'The outside yard is schematic. The 100 and 200 series are drawn as cylinders on instruction; in reality they are flat and cellular storage.',
  'Five bins are drawn but not counted. The 500 series is in service — it runs soya oil — but nothing upstream reports on it, so it appears in the yard and is left out of every count on this screen, all of which are over the 131 bins the plant does report. It is drawn rather than hidden because it is there; it is uncounted rather than shown empty because an empty bar would be a claim about it that nobody has made.',
].join('\n\n');

/**
 * Which colour is which material — the single most-used piece of reference on
 * this screen, and the filter behind "where is my maize?". It gets the
 * heavier CARD_PRIMARY treatment and the bigger swatches, so it reads as the
 * instrument it is rather than a caption tucked in the corner. The provenance
 * text that used to sit under it permanently is now behind the info button —
 * still honest, just not spending the screen's space every second of every
 * shift.
 */
export function MaterialKey({
  materials,
  compact,
  highlighted,
  onHighlight,
}: {
  materials: { code: string; name: string; color: string; count: number }[];
  compact?: boolean;
  /** material code currently isolated in the scene, if any */
  highlighted: string | null;
  onHighlight: (code: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  /*
   * Whatever is filtered is always shown, even if it would otherwise be past the
   * cut. Without this, filtering on a material that then drops out of the top
   * few — because the data refreshed, or the window got narrower — leaves the
   * plant greyed out with no visible control to turn it off. Escape worked;
   * nothing you could click did.
   */
  /* Counted from the model rather than passed in, so it cannot drift out of
     step with the scene the legend is describing. */
  const tagged = materials.reduce((n, m) => n + m.count, 0);

  const capacity = compact ? 8 : 6;
  const head = materials.slice(0, capacity);
  const pinned =
    highlighted !== null && !head.some((m) => m.code === highlighted)
      ? materials.find((m) => m.code === highlighted)
      : undefined;
  const shown = pinned ? [...head.slice(0, capacity - 1), pinned] : head;
  const rest = materials.length - shown.length;

  if (materials.length === 0) return null;

  return (
    <div className={cn(CARD_PRIMARY, 'max-w-[60vw] p-2')}>
      <div className="flex flex-wrap items-center gap-1">
        {/*
          The legend is also the filter. "Where is my maize?" is the question an
          operator actually arrives with, and pressing the swatch answers it by
          quietening every bin that holds something else. Deliberately dimming
          the rest rather than accenting the matches: the accent colour means
          "selected" and nothing else on this screen.
        */}
        {shown.map((mat) => {
          const on = highlighted === mat.code;
          return (
            <button
              key={mat.code}
              type="button"
              onClick={() => onHighlight(on ? null : mat.code)}
              aria-pressed={on}
              title={
                on
                  ? `Showing only ${mat.name} — press again to show everything`
                  : `${mat.name} — ${mat.count} bin${mat.count === 1 ? '' : 's'}. Press to pick it out.`
              }
              className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <span
                className={cn(
                  'inline-flex min-h-[28px] items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors',
                  compact ? 'max-w-[7.5rem]' : 'max-w-[13rem]',
                  on
                    ? 'bg-slate-700/70 text-white light:bg-gray-200 light:text-gray-900'
                    : 'text-slate-300 hover:bg-slate-800/70 light:text-gray-700 light:hover:bg-gray-100',
                )}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-black/20"
                  style={{ backgroundColor: mat.color }}
                />
                {/*
                  The name stays at every width.
                  Compact used to drop it and leave a bare swatch, which makes
                  colour the ONLY channel at exactly the size where it is least
                  reliable — and two of this plant's live materials come out
                  close together under deuteranopia. The row already wraps, so
                  keeping a truncated name costs a line, not a control.
                */}
                <span className="truncate">{mat.name}</span>
                <span className="font-mono text-[10px] text-slate-600 light:text-gray-500">
                  {mat.count}
                </span>
              </span>
            </button>
          );
        })}
        {rest > 0 && (
          <span className="px-1 font-mono text-[10px] text-slate-600 light:text-gray-500">
            +{rest}
          </span>
        )}

        {/*
          What this legend does NOT cover.
          A row of six colours next to a picture of 131 bins reads as a key to
          the picture, and it is not one: only the handful of bins the plant
          actually reports a material code for are coloured, and the rest are
          deliberately left as neutral vessels because inventing a colour for
          contents nobody has reported is the one thing this view must not do.
          Without this the legend makes a promise the scene cannot keep, and the
          honest reading — "most bins are untagged" — is indistinguishable from
          the alarming one, "the colours are broken".
        */}
        <span
          title={`${tagged} of ${TOTAL_BINS} bins report a material code. The rest are drawn as neutral vessels rather than being given a colour the plant has not reported.`}
          className="px-1 font-mono text-[10px] text-slate-600 light:text-gray-500"
        >
          {/* Just the ratio, not "N/131 tagged". The words cost a line: the card
              is capped at 60vw and the longer form wrapped the key to a second
              row, taking 28px off a 382px stage — 7% of the picture to explain
              a number the hover and the provenance note both already explain. */}
          {tagged}/{TOTAL_BINS}
        </span>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          title="How these numbers were arrived at"
          aria-label="How these numbers were arrived at"
          className="ml-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          <span className="flex min-h-[24px] min-w-[24px] items-center justify-center gap-0.5 rounded text-slate-500 hover:bg-slate-800/70 hover:text-slate-200 light:text-gray-500 light:hover:bg-gray-100 light:hover:text-gray-900">
            <Info className="h-3.5 w-3.5" />
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </span>
        </button>
      </div>

      {open && (
        <div className="mt-1.5 max-w-sm space-y-1.5 border-t border-slate-800 px-1.5 pb-1 pt-2 text-[11px] leading-relaxed text-slate-400 light:border-gray-200 light:text-gray-600">
          {PROVENANCE.split('\n\n').map((para) => (
            <p key={para.slice(0, 24)}>{para}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detail panel                                                        */
/* ------------------------------------------------------------------ */

function MiniSilo({ fill, color, hopper }: { fill: number | null; color: string; hopper: boolean }) {
  /* A hardcoded clipPath id is a document-wide name. One panel is open at a
     time today, but an id collision would silently clip the wrong shape. */
  const clipId = useId();
  const shape = hopper
    ? 'M9,16 L9,68 L21,90 L33,68 L33,16 L21,6 Z'
    : 'M9,16 L9,90 L33,90 L33,16 L21,6 Z';
  const bottom = 90;
  const level = fill === null ? 0 : bottom - (bottom - 16) * fill;

  return (
    <svg viewBox="0 0 42 96" className="h-24 w-[42px] shrink-0" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <path d={shape} />
        </clipPath>
      </defs>
      {/*
        Explicit colours rather than theme classes.
        The `light:` prefix in this app is a hand-written set in index.css, and
        it has no gray-200, no gray-400 and no fill-* at all — those classes
        generated nothing, so this diagram kept its dark-theme colours on a white
        card. Mid-tones chosen to sit correctly on either background.
      */}
      <path d={shape} fill="#64748b" fillOpacity="0.28" />
      {fill !== null && fill > 0 && (
        <rect
          x="0"
          y={level}
          width="42"
          height={bottom - level + 6}
          fill={color}
          clipPath={`url(#${clipId})`}
        />
      )}
      <path d={shape} fill="none" stroke="#94a3b8" strokeOpacity="0.85" strokeWidth="1.5" />
      {fill !== null && fill > 0.004 && fill < 0.996 && (
        <line x1="9" y1={level} x2="33" y2={level} stroke="#f8fafc" strokeWidth="1.2" opacity="0.8" />
      )}
      {fill === null && (
        <text
          x="21"
          y="54"
          textAnchor="middle"
          fill="#94a3b8"
          fontSize="11"
          fontFamily="monospace"
        >
          ***
        </text>
      )}
    </svg>
  );
}

/** A timestamp, or a dash. Never the literal string "Invalid Date". */
/** Past this, a reading is old enough that an operator must be told. */
const STALE_AFTER_MS = 900_000;

/**
 * A clock time AND how long ago it was.
 *
 * The time alone was a quiet lie by omission. In the current feed 65 rows carry
 * a timestamp six days old and 58 carry one from this morning, and rendered as
 * a bare `5:33:51 AM` those two are indistinguishable — at the exact moment
 * someone has clicked into a single bin to check it. The global "Not live" chip
 * is correct and is not enough: it speaks for the plant, not for the bin in
 * front of you.
 */
function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return `${new Date(t).toLocaleTimeString()} · ${ago((Date.now() - t) / 1000)}`;
}

/** True when a reading is old enough to say so in colour as well as in words. */
function isStale(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && Date.now() - t > STALE_AFTER_MS;
}

function Fact({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-slate-500 light:text-gray-500">
        {label}
      </dt>
      <dd className="truncate text-xs text-slate-200 light:text-gray-800" title={hint}>
        {value}
      </dd>
    </div>
  );
}

/**
 * Short label on screen, the full explanation on hover.
 *
 * Keyed by `NoLevelReason` rather than by `string`. Under `Record<string, ...>`
 * this map carried a fourth entry, 'no-material', for a reason `siloLevel()`
 * never returns and `NoLevelReason` does not contain — unreachable code that
 * looked maintained, and that the compiler had been told not to mind. Typing
 * the key means a reason that does not exist is now a build error, and a new
 * reason added to the union without a label here is one too.
 */
const NO_LEVEL: Record<NoLevelReason, { chip: string; detail: string }> = {
  'no-tag': {
    chip: 'Untagged bin',
    detail:
      'This bin has no quantity address in the PLC, so the plant never reports a level for it. Any number stored against it is whatever was last written to the row — it is not an inventory figure.',
  },
  'not-monitored': {
    chip: 'Not monitored',
    detail: 'In service on the plant, but its data does not reach this view — see the note below.',
  },
  'no-reading': { chip: 'No reading', detail: 'The plant returned no reading for this bin.' },
};

export function SiloDetailPanel({
  placement,
  reading,
  group,
  palette,
  onClose,
}: {
  placement: SiloPlacement;
  reading: SiloReading | undefined;
  group: SiloGroupSpec;
  palette: MaterialPalette;
  onClose: () => void;
}) {
  const level = siloLevel(placement, reading);
  const color = materialColorIn(palette, reading?.materialCode);
  const material = materialLabel(reading);
  const d = placement.dims;
  const noLevel = level.reason ? NO_LEVEL[level.reason] : null;

  return (
    <div className={cn(CARD_PRIMARY, 'flex w-72 max-w-[80vw] flex-col overflow-hidden')}>
      <div className="flex items-start gap-2 border-b border-slate-800 px-3 py-2.5 light:border-gray-200">
        <span
          className="mt-1 h-3 w-3 shrink-0 rounded-sm ring-1 ring-black/20"
          style={{ backgroundColor: color }}
        />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-base font-semibold leading-none text-white light:text-gray-900">
            Silo {placement.siloNo}
          </p>
          <p className="mt-1 truncate text-xs text-slate-400 light:text-gray-600" title={material}>
            {material}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close silo details"
          className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          <span className="flex min-h-[28px] min-w-[28px] items-center justify-center rounded text-slate-500 hover:bg-slate-800 hover:text-slate-200 light:text-gray-500 light:hover:bg-gray-100 light:hover:text-gray-900">
            <X className="h-4 w-4" />
          </span>
        </button>
      </div>

      <div className="flex gap-3 px-3 py-3">
        <MiniSilo fill={level.fill} color={color} hopper={d.hopper > 0} />
        <div className="min-w-0 flex-1">
          {level.fill === null ? (
            <p className="font-mono text-2xl leading-none text-slate-600 light:text-gray-500">***</p>
          ) : (
            <>
              <p className="font-mono text-2xl leading-none text-white light:text-gray-900">
                {formatPercent(level.fraction)}
              </p>
              <p className="mt-1 text-[11px] text-slate-400 light:text-gray-600">
                {formatKg(level.quantityKg)} of {formatCapacity(group.capacityKg)}
              </p>
            </>
          )}

          <div className="mt-2 flex flex-wrap gap-1">
            {reading?.hlActive && (
              <Chip tone="amber" title="High-level sensor active">
                <AlertTriangle className="h-3 w-3" /> High
              </Chip>
            )}
            {reading?.lockActive && (
              <Chip tone="red" title="Bin is locked">
                <Lock className="h-3 w-3" /> Locked
              </Chip>
            )}
            {level.outOfRange && (
              <Chip tone="amber" title="Reported quantity is outside 0 to capacity">
                Out of range
              </Chip>
            )}
            {noLevel && (
              <Chip tone="slate" title={noLevel.detail}>
                <Info className="h-3 w-3" /> {noLevel.chip}
              </Chip>
            )}
            {!reading?.hlActive && !reading?.lockActive && !level.outOfRange && !noLevel && (
              <Chip tone="green" title="Nothing flagged on this bin">
                <CheckCircle2 className="h-3 w-3" /> Normal
              </Chip>
            )}
          </div>

          {level.reason === 'no-tag' && level.quantityKg ? (
            <p
              className="mt-2 font-mono text-[10px] text-slate-600 light:text-gray-500"
              title="Stored against the row but never written by the plant"
            >
              stored: {formatKg(level.quantityKg)}
            </p>
          ) : null}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-slate-800 px-3 py-3 light:border-gray-200">
        <Fact label="Series" value={`${group.series} · ${group.label}`} hint={group.label} />
        <Fact label="Capacity" value={formatCapacity(group.capacityKg)} />
        {/*
          Arrangement, height and diameter are gone.

          None of the three is a fact about this bin that an operator can act
          on. Height is computed from capacity over an assumed bulk density,
          diameter is an assumption with the height derived from it, and the
          arrangement text was worse than either — for several groups it is a
          pattern nobody has confirmed, presented in the same weight as the
          capacity next to it. Three rows of hedged numbers to read past before
          reaching the two lines that matter.

          The honesty they carried has not been dropped, it has moved to where
          it belongs: the ⓘ disclosure states that every size here is derived
          rather than surveyed, that one bulk density is applied to every
          material, and that nothing is drawn to scale. Said once, properly,
          instead of six times in small grey letters.
        */}
        {/* `String(...)` rather than `?.trim()`: optional chaining guards null
            and undefined, not the wrong TYPE, and this field is typed
            string | null while the API sends numbers. Selecting a bin whose
            code arrived as a number used to throw straight out of this render. */}
        <Fact label="Material code" value={String(reading?.materialCode ?? '').trim() || '—'} />
        <Fact
          label="Updated"
          value={
            <span
              className={
                isStale(reading?.updatedAt) ? 'text-red-400 light:text-red-600' : undefined
              }
            >
              {formatTime(reading?.updatedAt)}
            </span>
          }
          hint={reading?.updatedAt ?? undefined}
        />
        <Fact
          label="Data block"
          value={reading?.dbNo ? `DB${reading.dbNo}` : '—'}
          hint={reading && !reading.dbNo ? 'No data block recorded for this bin' : undefined}
        />
      </dl>

      {group.note && (
        <p className="border-t border-slate-800 px-3 py-2.5 text-[11px] leading-relaxed text-slate-500 light:border-gray-200 light:text-gray-500">
          {group.note}
        </p>
      )}
    </div>
  );
}
