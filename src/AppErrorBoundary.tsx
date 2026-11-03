import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * The last line of defence: if a child throws during render or in an effect,
 * show the error and a Reload control instead of an empty page. Without this,
 * React 19 unmounts the root and the Writer sees only whatever static header
 * the browser had painted.
 *
 * The boundary never inserts model text and never touches a document; it only
 * displays the error the shell already has.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the error in the console for the Writer to copy into a bug report.
    // It is client-only and leaves from no network call.
    console.error("Obelus stopped unexpectedly:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-ground px-6 text-center text-ink">
          <h1 className="text-lg font-semibold">Obelus stopped unexpectedly</h1>
          <p className="mt-2 max-w-md text-sm text-muted-ink">
            Your writing is still in this browser. Reload to reopen the Library. If this keeps
            happening, open the browser console and send the error above.
          </p>
          <pre className="mt-3 max-h-48 max-w-2xl overflow-auto whitespace-pre-wrap rounded border border-rule bg-paper p-3 text-left font-mono text-xs text-muted-ink">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded bg-ink px-3 py-1.5 text-sm font-medium text-on-ink hover:bg-quiet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            Reload Obelus
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
