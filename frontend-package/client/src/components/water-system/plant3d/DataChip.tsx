/**
 * The per-bin data chip — the label the in-scene overlay draws over a silo
 * when the operator has asked for more than a bare number: `312 · 62% · 310
 * t`, the number in monospace, the other two in `tabular-nums`, coloured by
 * the bin's own status.
 *
 * Lives beside `PlantHud.tsx` rather than in it because it draws a DIFFERENT
 * palette from that file's `STATUS_COLORS` alone: `STATUS_COLORS` has four
 * entries (low/normal/high/alarm), and a data chip needs two more — a locked
 * bin and a bin with nothing to show — that are not fill-status readings at
 * all. `ChipStatus` is the superset; the four it shares with `STATUS_COLORS`
 * are read from there rather than re-typed, so the two files cannot drift on
 * what "high" means in hex.
 *
 * ONE THING TO KNOW BEFORE EDITING
 * --------------------------------
 * Same trap `PlantHud.tsx` documents at its own top: `index.css` carries
 * `:root.light button[class*="light:bg-"] { background-color: inherit
 * !important }` (and the text/border equivalents). This file never puts a
 * `light:` class on a `<button>` — the compact number variant renders a
 * `<span>` (`siloNumberPillClass`, imported rather than re-typed), and the
 * data variant is a `<span>` too: this chip is a label drawn over the
 * canvas, not a control, so it was never a button to begin with.
 */
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPercent } from '@/lib/plant3d/siloData';
import { HATCH_PATTERN, STATUS_COLORS, siloNumberPillClass, type StatusCategory } from './PlantHud';

/**
 * Every status a data chip can draw. `StatusCategory` (PlantHud.tsx) is the
 * four fill-status readings a bin's FRACTION can be in; `locked` and
 * `no-data` are not fractions at all — a locked bin can be locked at any
 * fill level (the lock is the fact that matters, not the fraction, which is
 * why `statusCategoryFor` already collapses a locked+alarmed bin to
 * `'alarm'` upstream of this file), and `no-data` is a bin this view was
 * never given a percentage or a tonnage for in the first place. Kept as
 * three siblings rather than folding `locked` into `alarm`'s red, because a
 * high-level alarm and an operational lock read the same in the shell today
 * (DESIGN.md's silo grammar) but do NOT read the same here on purpose — the
 * chip is the one place in this HUD where a lock gets its own colour, so a
 * glance at the overlay can tell "needs attention" from "on hold" apart.
 */
export type ChipStatus = StatusCategory | 'locked' | 'no-data';

/**
 * Locked reads slate, deliberately outside `STATUS_COLORS`'s four hues — a
 * lock is an operational hold, not a fill reading, and drawing it in the
 * alarm red or the low/high ambers would claim it is one.
 */
export const LOCKED_CHIP_COLOR = '#8896a6';

/** The hex this status draws as, or `null` for `no-data` (hatched, no hue). */
export function chipColor(status: ChipStatus): string | null {
  if (status === 'no-data') return null;
  if (status === 'locked') return LOCKED_CHIP_COLOR;
  return STATUS_COLORS[status];
}

/**
 * Layout and type classes for one status — sizing, spacing, the theme-aware
 * text colour, and the dashed rim DESIGN.md's silo grammar asks for on "no
 * data" ("0.35 alpha shell, 45deg hatch, dashed rim"). The colour itself
 * (background tint, border hue) is NOT a class: it is one of the six hexes
 * above, applied as an inline style by `<DataChip>`, the same way this app's
 * other data-meaningful palettes (`STATUS_COLORS` itself, `MATERIAL_PALETTE`,
 * `GAUGE_FILL`) already reach the DOM — this app's hand-written `light:` set
 * has no rule for any of them, and Tailwind's own palette would drift from
 * DESIGN.md's own hex table if asked to stand in.
 */
export function dataChipClass(status: ChipStatus): string {
  return cn(
    'inline-flex h-[15px] min-w-0 shrink-0 items-center gap-1 whitespace-nowrap rounded border px-1 font-medium leading-none',
    'text-white light:text-gray-900',
    status === 'no-data' && 'border-dashed',
  );
}

export interface DataChipProps {
  siloNo: number;
  /** 0..1 of rated capacity; null when there is nothing to show */
  percent: number | null;
  /** tonnes held; null when there is nothing to show */
  tonnes: number | null;
  status: ChipStatus;
  /**
   * `'number'` draws the existing compact pill (`siloNumberPillClass`) —
   * unchanged from today's overlay, no status colour, no fraction or
   * tonnage. `'data'` draws the three-part chip this file exists for.
   */
  mode?: 'number' | 'data';
}

/** "312 · 62% · 310 t", or the compact number-only pill — see `mode`. */
export function DataChip({ siloNo, percent, tonnes, status, mode = 'data' }: DataChipProps) {
  if (mode === 'number') {
    return <span className={siloNumberPillClass}>{siloNo}</span>;
  }

  const color = chipColor(status);
  const style: React.CSSProperties =
    color === null
      ? { backgroundImage: HATCH_PATTERN, borderColor: 'rgba(148,163,184,0.6)', backgroundColor: 'rgba(15,23,42,0.55)' }
      : { backgroundColor: `${color}33`, borderColor: `${color}b3` };

  const title =
    status === 'no-data'
      ? `Silo ${siloNo} — no level to show`
      : `Silo ${siloNo} — ${formatPercent(percent)}${tonnes === null ? '' : `, ${Math.round(tonnes)} t`}${
          status === 'locked' ? ', locked' : status === 'alarm' ? ', alarm' : ''
        }`;

  return (
    <span data-plant3d-data-chip data-status={status} className={dataChipClass(status)} style={style} title={title}>
      <span className="font-mono tabular-nums">{siloNo}</span>
      {status === 'no-data' ? (
        <>
          <span aria-hidden="true" className="opacity-60">
            ·
          </span>
          <span className="font-mono tabular-nums opacity-80">***</span>
        </>
      ) : (
        <>
          <span aria-hidden="true" className="opacity-60">
            ·
          </span>
          <span className="tabular-nums">{formatPercent(percent)}</span>
          <span aria-hidden="true" className="opacity-60">
            ·
          </span>
          <span className="font-mono tabular-nums">{tonnes === null ? '—' : `${Math.round(tonnes)} t`}</span>
        </>
      )}
      {status === 'locked' && <Lock aria-hidden="true" className="h-2.5 w-2.5 shrink-0" />}
    </span>
  );
}

/**
 * Estimated pixel width of the compact number-only chip (`mode: 'number'`),
 * matching `siloNumberPillClass`'s own metrics. This is the exact formula
 * `Plant3D.tsx`'s `SiloNumberProjector` already hand-computes inline
 * (`11 + 7 * digits`) for its overlap rejection — exported so that file can
 * read it from the one place that also owns the chip it is measuring,
 * instead of a second copy that could drift from the first.
 */
export function NUMBER_CHIP_W(digits: number): number {
  return 11 + 7 * digits;
}

/**
 * Estimated pixel width of the three-part data chip (`mode: 'data'`), for the
 * same overlap-rejection use. There is no fixed format to measure here — the
 * percent and tonnage text vary bin to bin — so this is deliberately
 * conservative: it assumes the widest realistic percent ("100%") and the
 * widest realistic tonnage (four digits plus " t", this plant's own largest
 * single bin at 1,600 t), so it can only ever OVERESTIMATE a real chip. That
 * is the safe direction to be wrong in — a projector that is a little too
 * cautious drops a label; one that is not cautious enough draws two chips on
 * top of each other, which is the failure DESIGN.md's "no overlap" rule
 * exists to prevent.
 */
export function DATA_CHIP_W(numberDigits: number): number {
  const PAD_AND_BORDER = 10;
  const GAPS = 4 * 3; // four `gap-1` flex gaps between five inline parts
  const SEPARATORS = 2 * 5; // two "·" glyphs
  const NUMBER = numberDigits * 6; // mono digits at this size
  const PERCENT = 4 * 6; // "100%"
  const TONNES = 7 * 6; // "1,600 t"
  return PAD_AND_BORDER + GAPS + SEPARATORS + NUMBER + PERCENT + TONNES;
}
