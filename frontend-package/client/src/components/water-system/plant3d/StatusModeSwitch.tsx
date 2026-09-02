/**
 * "Material | Fill" — the two-segment control at the legend dock's left end
 * that switches what colour a bin's fill draws: the material it holds, or
 * how full it is (DESIGN.md's fill-status mode, Phase 4 workstream F item 1
 * of the plan). Mutually exclusive, never blended — PRODUCT.md rule 3
 * ("material colour and status colour never share a channel").
 *
 * Lives inside `LegendDock`, which is `CARD_PRIMARY` — a themed card that
 * DOES follow light/dark, unlike the always-dark header strip `HeaderPill`
 * is built for. So this reaches for the same `light:` pairs the rest of
 * `PlantHud.tsx`'s `Pill` uses, and for the same reason that file documents
 * at its top: `:root.light button[class*="light:bg-"]` (and the text/border
 * equivalents) cancel any `light:` class placed directly on a `<button>`,
 * so the coloured classes live on an inner `<span>` and the `<button>`
 * itself carries only layout and focus classes.
 */
import { cn } from '@/lib/utils';

export type ColorMode = 'material' | 'status';

const OPTIONS: { mode: ColorMode; label: string; title: string }[] = [
  { mode: 'material', label: 'Material', title: 'Colour bins by the material they hold' },
  { mode: 'status', label: 'Fill', title: 'Colour bins by how full they are' },
];

export function StatusModeSwitch({
  colorMode,
  onColorMode,
}: {
  colorMode: ColorMode;
  onColorMode: (mode: ColorMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Colour bins by"
      data-plant3d-color-mode
      className="flex shrink-0 items-center gap-0.5 rounded bg-slate-800/60 p-0.5 light:bg-gray-100"
    >
      {OPTIONS.map(({ mode, label, title }) => {
        const active = colorMode === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onColorMode(mode)}
            title={title}
            aria-label={title}
            aria-pressed={active}
            className="touch-target-44 shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <span
              className={cn(
                'flex min-h-[24px] items-center whitespace-nowrap rounded px-2 text-[11px] font-medium transition-colors',
                active
                  ? 'bg-cyan-500/25 text-cyan-200 light:bg-cyan-100 light:text-cyan-700'
                  : 'text-slate-400 hover:text-slate-100 light:text-gray-500 light:hover:text-gray-900',
              )}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
