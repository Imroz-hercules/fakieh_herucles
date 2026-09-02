/**
 * The bottom-left canvas cluster: 3D/2D, X-ray, reset, fit, labels, zoom.
 *
 * Sits over the canvas the way `LegendDock` and the silo-number pills do —
 * DESIGN.md's page grammar says nothing else floats over the plant, and this
 * is the fourth thing to. `Plant3D.tsx` (which owns the stage's absolute
 * positioning) places it 8px in from the left edge, its own height above the
 * 32px `LegendDock` — this file only knows how to draw the row, not where it
 * sits.
 *
 * `CARD`, not `CARD_PRIMARY`: DESIGN.md's silo grammar draws exactly that
 * line — "the two surfaces that read the plant's own numbers... carry a
 * little more weight than a control cluster" — and this is a control
 * cluster, not a reading.
 *
 * ONE THING TO KNOW BEFORE EDITING
 * --------------------------------
 * `index.css` carries `:root.light button[class*="light:bg-"] {
 * background-color: inherit !important }` (and the text/border equivalents).
 * Every `light:` class below lives on an inner `<span>`, never on the
 * `<button>` itself — see `PlantHud.tsx`'s own note at its top, which this
 * file follows exactly.
 */
import { Frame, Layers, RotateCcw, Tag, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CARD, DIVIDER } from './PlantHud';

export type ViewMode = '3d' | '2d';
export type LabelMode = 'off' | 'numbers' | 'data';

const LABEL_CYCLE: LabelMode[] = ['off', 'numbers', 'data'];
const LABEL_TEXT: Record<LabelMode, string> = { off: 'Off', numbers: 'No.', data: 'Data' };
const LABEL_TITLE: Record<LabelMode, string> = {
  off: 'Off',
  numbers: 'Numbers',
  data: 'Numbers and data',
};

function nextLabelMode(mode: LabelMode): LabelMode {
  return LABEL_CYCLE[(LABEL_CYCLE.indexOf(mode) + 1) % LABEL_CYCLE.length];
}

/** A pressable toggle — sized to the 32px minimum this file's siblings use,
    `touch-target-44` growing it to 44px under a coarse pointer. */
function CtrlToggle({
  active,
  onClick,
  title,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={label}
      aria-pressed={active}
      className="touch-target-44 shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
    >
      <span
        className={cn(
          'flex min-h-[28px] items-center gap-1 whitespace-nowrap rounded px-1.5 text-[11px] font-medium leading-none transition-colors active:scale-95',
          active
            ? 'bg-cyan-500/25 text-cyan-200 light:bg-cyan-100 light:text-cyan-700'
            : 'text-slate-300 hover:bg-slate-800/70 hover:text-white light:text-gray-600 light:hover:bg-gray-100 light:hover:text-gray-900',
        )}
      >
        {children}
      </span>
    </button>
  );
}

/** A one-shot action — same box, no pressed state. */
function CtrlAction({
  onClick,
  title,
  label,
  children,
}: {
  onClick: () => void;
  title: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={label}
      className="touch-target-44 shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
    >
      <span className="flex min-h-[28px] min-w-[28px] items-center justify-center rounded text-slate-300 transition-colors hover:bg-slate-800/70 hover:text-white active:scale-95 light:text-gray-600 light:hover:bg-gray-100 light:hover:text-gray-900">
        {children}
      </span>
    </button>
  );
}

export interface ControlBarProps {
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  xray: boolean;
  onXray: (xray: boolean) => void;
  onReset: () => void;
  onFit: () => void;
  labels: LabelMode;
  onLabels: (mode: LabelMode) => void;
  /** in/out; how much one press moves is `Plant3D.tsx`'s call */
  onZoom: (direction: 'in' | 'out') => void;
}

export function ControlBar({
  viewMode,
  onViewMode,
  xray,
  onXray,
  onReset,
  onFit,
  labels,
  onLabels,
  onZoom,
}: ControlBarProps) {
  const upcoming = nextLabelMode(labels);
  return (
    <div data-plant3d-controlbar className={cn(CARD, 'flex items-center gap-0.5 p-1')}>
      <div
        role="group"
        aria-label="View mode"
        className="flex shrink-0 items-center gap-0.5 rounded bg-slate-800/60 p-0.5 light:bg-gray-100"
      >
        <CtrlToggle active={viewMode === '3d'} onClick={() => onViewMode('3d')} title="3D view" label="3D view">
          3D
        </CtrlToggle>
        <CtrlToggle
          active={viewMode === '2d'}
          onClick={() => onViewMode('2d')}
          title="2D plan view"
          label="2D plan view"
        >
          2D
        </CtrlToggle>
      </div>

      <span className={DIVIDER} />

      <CtrlToggle
        active={xray}
        onClick={() => onXray(!xray)}
        title="See inside the silos"
        label="See inside the silos"
      >
        <Layers className="h-3.5 w-3.5" />
      </CtrlToggle>

      <CtrlAction onClick={onReset} title="Reset view" label="Reset view">
        <RotateCcw className="h-3.5 w-3.5" />
      </CtrlAction>
      <CtrlAction onClick={onFit} title="Fit all" label="Fit all">
        <Frame className="h-3.5 w-3.5" />
      </CtrlAction>

      <span className={DIVIDER} />

      <CtrlToggle
        active={labels !== 'off'}
        onClick={() => onLabels(upcoming)}
        title={`Bin labels: ${LABEL_TITLE[labels]} — press for ${LABEL_TITLE[upcoming]}`}
        label="Bin labels"
      >
        <Tag className="h-3.5 w-3.5" />
        <span>{LABEL_TEXT[labels]}</span>
      </CtrlToggle>

      <span className={DIVIDER} />

      <CtrlAction onClick={() => onZoom('in')} title="Zoom in" label="Zoom in">
        <ZoomIn className="h-3.5 w-3.5" />
      </CtrlAction>
      <CtrlAction onClick={() => onZoom('out')} title="Zoom out" label="Zoom out">
        <ZoomOut className="h-3.5 w-3.5" />
      </CtrlAction>
    </div>
  );
}
