import { useState } from "react";
import {
  OUTPUT_SHAPES,
  PASS_SCOPES,
  passAcceptsFrame,
  type OutputShape,
  type Pass,
  type PassScope,
  type RuleConfig,
} from "../core/pass";
import { SCREENING_FRAMES, type ScreeningFrame } from "../core/screeningFrame";
import { passProblem } from "../core/passSet";
import { placeholderTokens } from "../core/prompt";
import type {
  PromptAssistantRequest,
  PromptAssistantResult,
} from "../core/promptAssistant";
import { describeError } from "../errors";
import { RulePassesPanel } from "../editor/RulePassesPanel";

/**
 * The Pass workbench (story 98 onward). It is where the Writer writes their own
 * model Pass prompts and chooses each Pass's scope and output shape, imports
 * and exports the whole Pass set, restores the Starter pack, and asks the
 * prompt-authoring assistant for a draft.
 *
 * It edits Pass records only. Nothing here can touch a Document: a prompt is
 * instructions to a model, and the Editor is the only surface that holds prose.
 * The assistant's suggestion reaches a Pass prompt through the Writer's own
 * click, never a Finding and never the Document.
 */
export interface WorkbenchViewProps {
  passes: Pass[];
  passSetError: string | null;
  onClearPassSetError: () => void;
  /** Story 98: stores a model Pass the Writer wrote or edited. */
  onSavePass: (pass: Pass) => Promise<boolean>;
  /** Story 102: downloads the Pass set. */
  onExport: () => void;
  /** Story 102: replaces the Pass set from a file. */
  onImport: (json: string) => Promise<boolean>;
  /** Story 103: restores the Starter pack. */
  onRestore: () => Promise<void>;
  onToggle: (passId: string, enabled: boolean) => void;
  onSaveRuleConfig: (passId: string, ruleConfig: RuleConfig) => void;
  /** Story 98: a blank model Pass to edit; it is stored only when saved. */
  onNewPass: () => Pass;
  /** Stories 104 and 105: the prompt-authoring assistant. */
  assistantRunning: boolean;
  assistantError: string | null;
  onAssist: (input: PromptAssistantRequest) => Promise<PromptAssistantResult | null>;
  criticName: string | null;
}

export function WorkbenchView({
  passes,
  passSetError,
  onClearPassSetError,
  onSavePass,
  onNewPass,
  onExport,
  onImport,
  onRestore,
  onToggle,
  onSaveRuleConfig,
  assistantRunning,
  assistantError,
  onAssist,
  criticName,
}: WorkbenchViewProps) {
  const modelPasses = passes.filter((pass) => pass.kind === "model");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newDraft, setNewDraft] = useState<Pass | null>(null);
  /** A failure reading the chosen file, distinct from the hook's parse errors. */
  const [readError, setReadError] = useState<string | null>(null);

  const startNewPass = () => {
    setEditingId(null);
    setNewDraft(onNewPass());
  };

  // The hook sets `passSetError` with the specific reason a file was refused,
  // so this only has to surface a file that could not be read at all.
  const onImportFile = async (file: File | undefined) => {
    if (file === undefined) return;
    try {
      const text = await file.text();
      setReadError(null);
      await onImport(text);
    } catch (error) {
      setReadError(describeError(error));
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Pass workbench</h1>
          <p className="mt-1 max-w-xl text-sm text-stone-600">
            Write your own Pass prompts, choose each Pass's scope and output shape, and move the
            whole Pass set in and out as JSON. A prompt with an unknown placeholder is refused on
            save.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={startNewPass}
            className="rounded bg-stone-900 px-3 py-1.5 text-xs font-medium text-stone-50 hover:bg-stone-700"
          >
            New Pass
          </button>
          <button
            type="button"
            onClick={onExport}
            className="rounded border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
          >
            Export pass set
          </button>
          <label className="cursor-pointer rounded border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100">
            Import pass set
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void onImportFile(file);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => void onRestore()}
            className="rounded border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
          >
            Restore Starter pack
          </button>
        </div>
      </div>

      {(readError !== null || passSetError !== null) && (
        <div className="mt-4 flex items-start justify-between gap-4 rounded border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span>{readError ?? passSetError}</span>
          <button
            type="button"
            className="shrink-0 text-xs font-medium underline"
            onClick={() => {
              setReadError(null);
              onClearPassSetError();
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-stone-800">Model passes</h2>
        <p className="mt-1 text-xs text-stone-500">
          {criticName === null
            ? "Assign a Connection to the critic Slot before asking the assistant for a draft."
            : `The assistant drafts prompts through the critic Connection: ${criticName}.`}
        </p>
        {newDraft !== null && (
          <div className="mt-3 rounded border border-stone-300 bg-white">
            <div className="border-b border-stone-200 px-4 py-2 text-xs font-medium text-stone-700">
              New Pass — not saved yet
            </div>
            <ModelPassEditor
              key={newDraft.id}
              pass={newDraft}
              assistantRunning={assistantRunning}
              assistantError={assistantError}
              onAssist={onAssist}
              onSave={async (edited) => {
                const saved = await onSavePass(edited);
                if (saved) setNewDraft(null);
                return saved;
              }}
              onCancel={() => setNewDraft(null)}
            />
          </div>
        )}
        <ul className="mt-3 space-y-2">
          {modelPasses.map((pass) => {
            const editing = editingId === pass.id;
            return (
              <li key={pass.id} className="rounded border border-stone-200 bg-white">
                <div className="flex items-start gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={pass.enabled}
                    aria-label={`Enable ${pass.name}`}
                    onChange={(event) => onToggle(pass.id, event.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-stone-800">{pass.name}</p>
                    <p className="mt-0.5 text-xs text-stone-500">{pass.description}</p>
                    <p className="mt-1 text-xs text-stone-400">
                      {scopeLabel(pass.scope)} · {outputLabel(pass.output)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingId((current) => (current === pass.id ? null : pass.id))}
                    className="shrink-0 rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100"
                  >
                    {editing ? "Close" : "Edit"}
                  </button>
                </div>
                {editing && (
                  <ModelPassEditor
                    key={pass.id}
                    pass={pass}
                    assistantRunning={assistantRunning}
                    assistantError={assistantError}
                    onAssist={onAssist}
                    onSave={async (edited) => {
                      const saved = await onSavePass(edited);
                      if (saved) setEditingId(null);
                      return saved;
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                )}
              </li>
            );
          })}
          {modelPasses.length === 0 && (
            <li className="rounded border border-stone-200 bg-white px-4 py-4 text-sm text-stone-500">
              No model Passes yet. Add one, or restore the Starter pack.
            </li>
          )}
        </ul>
      </section>

      <div className="mt-6 rounded border border-stone-200 bg-white">
        <RulePassesPanel passes={passes} onToggle={onToggle} onSaveConfig={onSaveRuleConfig} />
      </div>
    </main>
  );
}

interface ModelPassEditorProps {
  pass: Pass;
  assistantRunning: boolean;
  assistantError: string | null;
  onAssist: (input: PromptAssistantRequest) => Promise<PromptAssistantResult | null>;
  onSave: (pass: Pass) => Promise<boolean>;
  onCancel: () => void;
}

function ModelPassEditor({
  pass,
  assistantRunning,
  assistantError,
  onAssist,
  onSave,
  onCancel,
}: ModelPassEditorProps) {
  const [draft, setDraft] = useState<Pass>(pass);
  const [error, setError] = useState<string | null>(null);
  const [assistantRequest, setAssistantRequest] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const save = async () => {
    const problem = passProblem(draft);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setError(null);
    await onSave(draft);
  };

  const ask = async () => {
    setSuggestion(null);
    const result = await onAssist({ request: assistantRequest, prompt: draft.prompt ?? "" });
    if (result !== null) setSuggestion(result.suggestion);
  };

  return (
    <div className="space-y-3 border-t border-stone-200 bg-stone-100/70 px-4 py-3">
      <label className="block">
        <span className="text-xs font-medium text-stone-700">Name</span>
        <input
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-stone-700">Description</span>
        <input
          value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
        />
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="block">
          <span className="text-xs font-medium text-stone-700">Pass scope</span>
          <select
            value={draft.scope}
            onChange={(event) =>
              setDraft({ ...draft, scope: event.target.value as PassScope })
            }
            className="mt-1 block rounded border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
          >
            {PASS_SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {scopeLabel(scope)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-stone-700">Output shape</span>
          <select
            value={draft.output}
            onChange={(event) => {
              const output = event.target.value as OutputShape;
              setDraft((current) => {
                const next: Pass = { ...current, output };
                // Story 154: a frame belongs to a critic Finding Pass only, so
                // switching to the Reader or Audit shape drops it rather than
                // saving a field `passProblem` would refuse.
                if (passAcceptsFrame(next)) return next;
                delete next.frame;
                return next;
              });
            }}
            className="mt-1 block rounded border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
          >
            {OUTPUT_SHAPES.map((output) => (
              <option key={output} value={output}>
                {outputLabel(output)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {passAcceptsFrame(draft) && (
        <label className="block">
          <span className="text-xs font-medium text-stone-700">Screening frame</span>
          <select
            value={draft.frame ?? "default"}
            onChange={(event) =>
              setDraft({ ...draft, frame: event.target.value as ScreeningFrame })
            }
            className="mt-1 block rounded border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
          >
            {SCREENING_FRAMES.map((frame) => (
              <option key={frame} value={frame}>
                {frameLabel(frame)}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-stone-500">
            Who this Pass is written for. The Reader and the Audit keep their own stance.
          </span>
        </label>
      )}

      <label className="block">
        <span className="text-xs font-medium text-stone-700">Prompt</span>
        <textarea
          rows={12}
          value={draft.prompt ?? ""}
          spellCheck={false}
          onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
          className="mt-1 w-full resize-y rounded border border-stone-300 bg-white px-2 py-1.5 font-mono text-xs focus:border-stone-500 focus:outline-none"
        />
        <span className="mt-1 block text-xs text-stone-500">
          Placeholders: {placeholderTokens().join(", ")}. Any other placeholder is refused on save.
        </span>
      </label>

      <PromptAssistant
        request={assistantRequest}
        onRequest={setAssistantRequest}
        running={assistantRunning}
        error={assistantError}
        suggestion={suggestion}
        onAsk={() => void ask()}
        onUse={(text) => {
          setDraft((current) => ({ ...current, prompt: text }));
          setSuggestion(null);
        }}
      />

      {error !== null && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          className="rounded bg-stone-900 px-3 py-1 text-xs font-medium text-stone-50 hover:bg-stone-700"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface PromptAssistantProps {
  request: string;
  onRequest: (value: string) => void;
  running: boolean;
  error: string | null;
  suggestion: string | null;
  onAsk: () => void;
  onUse: (text: string) => void;
}

/**
 * Stories 104 and 105. The assistant is a help field for the prompt, not a
 * writing field for the prose: it is given the Writer's request and the current
 * prompt, and its suggestion reaches the prompt only when the Writer chooses to
 * use it. The suggestion is prompt text, so it stays selectable and copyable.
 */
function PromptAssistant({
  request,
  onRequest,
  running,
  error,
  suggestion,
  onAsk,
  onUse,
}: PromptAssistantProps) {
  return (
    <div className="rounded border border-stone-300 bg-white p-3">
      <p className="text-xs font-medium text-stone-700">Prompt assistant</p>
      <p className="mt-0.5 text-xs text-stone-500">
        Ask for help writing this Pass prompt. The assistant sees only your request and the prompt
        above — never your Document.
      </p>
      <textarea
        rows={2}
        value={request}
        onChange={(event) => onRequest(event.target.value)}
        placeholder="What should this Pass look for?"
        className="mt-2 w-full resize-none rounded border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
      />
      <button
        type="button"
        disabled={running}
        onClick={onAsk}
        className="mt-2 rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {running ? "Drafting…" : "Draft a prompt"}
      </button>

      {error !== null && (
        <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {error}
        </p>
      )}

      {suggestion !== null && (
        <div className="mt-2">
          <p className="text-xs font-medium text-stone-700">Suggested prompt</p>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-xs text-stone-800">
            {suggestion}
          </pre>
          <button
            type="button"
            onClick={() => onUse(suggestion)}
            className="mt-2 rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100"
          >
            Use this prompt
          </button>
        </div>
      )}
    </div>
  );
}

/** The Writer-facing name for a Screening frame. */
function frameLabel(frame: ScreeningFrame): string {
  switch (frame) {
    case "default":
      return "Default (editor screening a submission)";
    case "skimmer":
      return "Skimmer (no time, no patience)";
    case "skeptic":
      return "Skeptic (hostile domain expert)";
    case "practitioner":
      return "Practitioner (must act this week)";
  }
}

/** The Writer-facing name for a Pass scope. */
function scopeLabel(scope: PassScope): string {
  switch (scope) {
    case "document":
      return "Whole Document";
    case "section":
      return "Section";
    case "paragraph":
      return "Paragraph";
  }
}

/** The Writer-facing name for an output shape. */
function outputLabel(output: OutputShape): string {
  switch (output) {
    case "findings":
      return "Findings";
    case "section-summary":
      return "Reader account (section summary)";
    case "audit":
      return "Audit account (reasoning)";
  }
}
