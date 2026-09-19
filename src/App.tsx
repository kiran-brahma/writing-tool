import { useState, type ReactNode } from "react";
import { DocumentEditor } from "./editor/DocumentEditor";
import { useDocumentSession } from "./useDocumentSession";

/**
 * The Obelus shell. It opens the one Document of record and puts the Writer
 * straight into it: no account, no sign-in. Everything is local — this ticket
 * adds no Connection and makes no outbound request.
 */
export default function App() {
  const { status, openError, saveError, document, revisions, handleChange, flagMilestone } =
    useDocumentSession();
  const [milestoneNote, setMilestoneNote] = useState("");
  const [milestonesOnly, setMilestonesOnly] = useState(false);

  if (status === "loading") {
    return (
      <CenteredMessage>
        <p className="text-stone-500">Opening your Library…</p>
      </CenteredMessage>
    );
  }

  if (status === "error") {
    return (
      <CenteredMessage>
        <h1 className="text-lg font-semibold text-stone-900">Obelus could not open your Library</h1>
        <p className="mt-2 max-w-md text-sm text-stone-600">{openError}</p>
      </CenteredMessage>
    );
  }

  const visibleRevisions = milestonesOnly
    ? revisions.filter((revision) => revision.flagged)
    : revisions;

  const onFlagMilestone = async () => {
    await flagMilestone(milestoneNote);
    setMilestoneNote("");
  };

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-stone-900">
      <header className="flex items-center justify-between border-b border-stone-200 px-6 py-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Obelus</h1>
          <p className="text-xs text-stone-500">It marks; it never holds the pen.</p>
        </div>
        <p className="text-xs text-stone-500">{document?.wordCount ?? 0} words</p>
      </header>

      {saveError !== null && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900">
          Could not save your Document: {saveError}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="flex min-h-0 flex-1 flex-col bg-white">
          {document !== null && (
            <DocumentEditor
              key={document.id}
              initialContent={document.tree}
              onChange={handleChange}
            />
          )}
        </main>

        <aside className="flex w-80 flex-col border-l border-stone-200 bg-stone-100/60">
          <div className="space-y-3 border-b border-stone-200 p-4">
            <h2 className="text-sm font-semibold">Milestones</h2>
            <textarea
              value={milestoneNote}
              onChange={(event) => setMilestoneNote(event.target.value)}
              placeholder="Note for this milestone (optional)"
              rows={2}
              className="w-full resize-none rounded border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void onFlagMilestone()}
              className="w-full rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-stone-50 hover:bg-stone-700"
            >
              Flag this Revision
            </button>
          </div>

          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2">
            <h2 className="text-sm font-semibold">Revisions</h2>
            <label className="flex items-center gap-1.5 text-xs text-stone-600">
              <input
                type="checkbox"
                checked={milestonesOnly}
                onChange={(event) => setMilestonesOnly(event.target.checked)}
              />
              Milestones only
            </label>
          </div>

          <ol className="min-h-0 flex-1 overflow-y-auto">
            {visibleRevisions.length === 0 && (
              <li className="px-4 py-4 text-sm text-stone-500">
                {milestonesOnly
                  ? "No milestones yet. Flag one to make it findable later."
                  : "Revisions appear as you write."}
              </li>
            )}
            {visibleRevisions.map((revision) => (
              <li key={revision.id} className="border-b border-stone-200/70 px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-stone-700">
                    {new Date(revision.createdAt).toLocaleString()}
                  </span>
                  {revision.flagged && (
                    <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs font-medium text-amber-900">
                      Milestone
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-stone-500">{revision.wordCount} words</p>
                {revision.note !== null && revision.note !== "" && (
                  <p className="mt-1 text-stone-700">{revision.note}</p>
                )}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 text-center">
      {children}
    </div>
  );
}
