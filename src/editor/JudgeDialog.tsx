import { useEffect } from "react";
import type { AnchorDraft } from "../core/finding";
import type { JudgeResult } from "../core/judge";
import type { Connection } from "../wire/connection";
import { JudgePanel, type JudgeRevision } from "./JudgePanel";

export interface JudgeDialogProps {
  open: boolean;
  onClose: () => void;
  revisions: JudgeRevision[];
  currentCanonical: string;
  selection: AnchorDraft | null;
  section: AnchorDraft | null;
  judge: Connection | null;
  judgeIsDefault: boolean;
  sameModelWarning: string | null;
  running: boolean;
  error: string | null;
  result: JudgeResult | null;
  onJudge: (before: string, after: string) => void;
}

/**
 * The Judge on demand. It opens over the editor from the Status line's Compare
 * action and closes back to the prose. The rail stays findings-only.
 */
export function JudgeDialog({
  open,
  onClose,
  revisions,
  currentCanonical,
  selection,
  section,
  judge,
  judgeIsDefault,
  sameModelWarning,
  running,
  error,
  result,
  onJudge,
}: JudgeDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Compare versions"
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 sm:p-8"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-rule bg-paper shadow-xl">
        <div className="flex items-center justify-between border-b border-rule px-4 py-2">
          <h2 className="text-base font-semibold text-ink">Compare versions</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm font-medium text-muted-ink hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Close
          </button>
        </div>
        <JudgePanel
          revisions={revisions}
          currentCanonical={currentCanonical}
          selection={selection}
          section={section}
          judge={judge}
          judgeIsDefault={judgeIsDefault}
          sameModelWarning={sameModelWarning}
          running={running}
          error={error}
          result={result}
          onJudge={onJudge}
        />
      </div>
    </div>
  );
}
