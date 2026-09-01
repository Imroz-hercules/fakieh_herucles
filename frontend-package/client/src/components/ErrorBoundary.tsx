import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Keeps one broken screen from taking the whole app down with it.
 *
 * This app had no error boundary at all, and it cost a full outage of the 3D
 * view: `materialCode` is typed `string | null`, the API sent a number, a
 * `.trim()` went looking for a method that was not there, and React did what
 * React does with an error thrown out of a render — it unmounted the entire
 * tree. Not the silo. Not the panel. The page went blank and STAYED blank,
 * because there was nothing above it to catch and nothing to re-mount. The
 * only way back was a manual reload, and the screen gave no hint that was so.
 *
 * That is the failure this exists to bound. The rule it enforces is narrow and
 * worth stating: a component may fail, and a route may fail, but the operator
 * must always be left with something on screen that tells them what happened.
 *
 * Two things this deliberately does NOT do:
 *
 *   It does not pretend. A caught error renders a plainly broken-looking panel
 *   naming the failure, not an empty state or a spinner. This view's whole job
 *   is to report what a plant is doing; a fallback that looks like a normal
 *   quiet screen would be the single most dangerous thing it could show. An
 *   operator must never be able to mistake "this view crashed" for "the silos
 *   are empty".
 *
 *   It does not swallow. The error and the component stack still go to the
 *   console, so a crash remains as diagnosable as it was before — the boundary
 *   changes what the user sees, not what an engineer can find out.
 *
 * Errors thrown in event handlers, in `setTimeout`, or inside promises do not
 * reach a boundary; React only routes rendering, lifecycle and constructor
 * errors here. So this is a backstop for bad DATA flowing into a render, which
 * is exactly the failure mode seen, and not a general exception handler.
 */

interface Props {
  children: ReactNode;
  /** Shown in the fallback so the operator knows which screen failed. */
  name: string;
  /*
   * Changing this clears a caught error and re-mounts the children.
   *
   * Without it a boundary latches: once tripped it holds the fallback for the
   * lifetime of the mount, so navigating away and back would return to the
   * same dead panel and look like the crash had spread. Passing the route
   * through means leaving and returning genuinely retries.
   */
  resetKey?: string | number;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  private lastResetKey = this.props.resetKey;

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(): void {
    if (this.props.resetKey !== this.lastResetKey) {
      this.lastResetKey = this.props.resetKey;
      if (this.state.error) this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    /* Kept as console.error rather than a toast or a logger: this has to work
       when the tree below is already in an unknown state, and it has to be
       readable in the headless harness, which reads the console. */
    console.error(`[${this.props.name}] crashed and was contained`, error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full min-h-[240px] w-full items-center justify-center p-6">
        <div className="max-w-lg rounded-lg border border-red-500/40 bg-red-950/40 p-5 text-sm light:border-red-300 light:bg-red-50">
          <p className="font-semibold text-red-200 light:text-red-800">
            {this.props.name} stopped responding
          </p>
          <p className="mt-2 text-red-100/80 light:text-red-700">
            This screen hit an error and has been isolated so the rest of the app keeps working.
            Nothing here is showing live plant data — do not read it as a plant state.
          </p>
          {/* The message is the one thing that makes a report actionable, so it
              is shown rather than hidden behind a console the operator will not
              open. `break-words` because these can be long and unbroken. */}
          <p className="mt-3 break-words font-mono text-xs text-red-200/70 light:text-red-600">
            {error.message || String(error)}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-4 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            {/* The label lives on an inner span: a global rule in index.css,
                `:root.light button[class*="light:bg-"]{background:inherit!important}`,
                cancels light: background classes when they sit on the button
                itself. */}
            <span className="flex min-h-[32px] items-center rounded-md bg-red-500/20 px-3 text-xs font-medium text-red-100 transition-colors hover:bg-red-500/30 light:bg-red-100 light:text-red-800">
              Try again
            </span>
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
