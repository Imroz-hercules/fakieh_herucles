/**
 * "Whole site › Raw Material › Silo 312" — replaces the zone segmented
 * control's label area (`headerCenter` on `WaterSystemLayout`, and its
 * floating full-screen twin) once a bin is focused, per DESIGN.md's page
 * grammar ("Breadcrumb replaces the zone switch's label area when a bin is
 * focused") and the plan's workstream F item 3.
 *
 * `Plant3D.tsx` decides WHEN to show this in place of `ZoneSwitch` — this
 * component only knows how to draw the three segments once asked to. It
 * lives in the same always-dark header strip `ZoneSwitch`'s `HeaderPill` is
 * built for (`WaterSystemLayout`'s header is `bg-[#0f172a]` unconditionally,
 * not theme-aware — see the note at the top of `PlantHud.tsx`), so, like
 * `HeaderPill`, this carries no `light:` classes at all rather than pairs
 * that would never apply.
 */
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Breadcrumb({
  zoneLabel,
  siloNo,
  onZone,
  onSite,
}: {
  /** the zone the focused bin belongs to, e.g. "Raw Material" */
  zoneLabel: string;
  siloNo: number;
  /** step back to the zone framing */
  onZone: () => void;
  /** step back to the whole-site framing */
  onSite: () => void;
}) {
  const crumb = (label: string, current: boolean) => (
    <span
      className={cn(
        'whitespace-nowrap text-[13px] font-medium leading-none',
        current ? 'text-white' : 'text-slate-300 group-hover:text-white',
      )}
    >
      {label}
    </span>
  );

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto">
      <button
        type="button"
        onClick={onSite}
        title="Frame the whole site"
        className="group shrink-0 rounded px-1 -mx-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      >
        {crumb('Whole site', false)}
      </button>
      <ChevronRight className="h-3 w-3 shrink-0 text-slate-600" aria-hidden="true" />
      <button
        type="button"
        onClick={onZone}
        title={`Frame ${zoneLabel}`}
        className="group min-w-0 shrink truncate rounded px-1 -mx-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      >
        {crumb(zoneLabel, false)}
      </button>
      <ChevronRight className="h-3 w-3 shrink-0 text-slate-600" aria-hidden="true" />
      {/*
        The current position, not a link back to itself — `aria-current`
        rather than a working onClick, matching the usual breadcrumb pattern
        (WAI-ARIA APG: the last crumb represents the current page). Still a
        `<button disabled>` rather than a bare span, so it keeps the same
        element shape and hover/focus styling contract as its two siblings
        instead of visually jumping when it becomes the last segment.
      */}
      <button
        type="button"
        disabled
        aria-current="page"
        className="shrink-0 cursor-default rounded px-1 -mx-1"
      >
        <span className="whitespace-nowrap font-mono text-[13px] font-semibold leading-none text-white">
          Silo {siloNo}
        </span>
      </button>
    </nav>
  );
}
