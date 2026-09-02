/**
 * "Drag to orbit · scroll to zoom · tap a bin" — a single line in the
 * canvas' bottom-right corner, shown once per browser (plan workstream F
 * item 6, DESIGN.md's "Hints: on first run only ... no tour").
 *
 * Self-contained on purpose: the only thing a caller can do is find out when
 * it goes away (`onDismiss`). Everything else — whether to show at all,
 * when to start the fade, what counts as "the operator has taken over" — is
 * this component's own concern, so `Plant3D.tsx` only has to mount it
 * somewhere inside the stage (it positions itself, `absolute bottom-2
 * right-2`, matching DESIGN.md's 8px canvas-edge gutter) rather than thread
 * a run of hint state through a file this workstream does not own.
 *
 * Persistence is `localStorage`, wrapped in try/catch per this app's own
 * rule for it (private browsing, storage disabled, or a full quota all
 * throw) — a hint that fails to remember it was shown once is a nuisance,
 * not a bug worth crashing the page over.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

const HINT_KEY = 'plant3d.hint.v1';
const HINT_DURATION_MS = 4000;

export function Hint({ onDismiss }: { onDismiss?: () => void }) {
  const [visible, setVisible] = useState(false);
  const dismissedRef = useRef(false);
  const reduceMotion = useReducedMotion();

  /* Decide once, on mount, whether this browser has already seen the hint. */
  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(HINT_KEY) === '1';
    } catch {
      /* Storage unavailable — treat as unseen; this tab shows it once. */
      seen = false;
    }
    if (seen) return;
    setVisible(true);
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* Nothing to do — the hint simply may show again next visit. */
    }
  }, []);

  const dismiss = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setVisible(false);
    onDismiss?.();
  };

  /* The 4s timer and the "first pointer interaction" listener both fire the
     same dismiss, whichever comes first. A window-level listener rather than
     one scoped to the canvas: any interaction with the view — orbiting,
     pressing a HUD control, tapping a row — is "the operator has taken
     over", not only a drag inside the WebGL element itself. */
  useEffect(() => {
    if (!visible) return undefined;
    const timer = window.setTimeout(dismiss, HINT_DURATION_MS);
    const onPointer = () => dismiss();
    window.addEventListener('pointerdown', onPointer, { once: true, passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', onPointer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.p
          role="status"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
          className={
            'pointer-events-none absolute bottom-2 right-2 z-10 whitespace-nowrap rounded ' +
            'bg-slate-950/70 px-2 py-1 text-[11px] text-slate-200 shadow-sm ' +
            'light:bg-white/90 light:text-gray-700 light:shadow-sm'
          }
        >
          Drag to orbit · scroll to zoom · tap a bin
        </motion.p>
      )}
    </AnimatePresence>
  );
}
