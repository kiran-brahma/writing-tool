import { useState } from "react";
import type { Pass, RuleConfig } from "../core/pass";
import { applyFieldText, fieldText, ruleFields, type RuleField } from "./ruleConfigText";

/**
 * The Writer edits the word lists and patterns behind one rule Pass. It is data
 * editing, not prose editing — nothing here can insert a word into the Document.
 * It lives apart from any panel so the rail's word Band and the Workbench share
 * one editor and cannot drift.
 */
export interface RuleConfigEditorProps {
  pass: Pass;
  onSave: (ruleConfig: RuleConfig) => void;
  onCancel: () => void;
}

export function RuleConfigEditor({ pass, onSave, onCancel }: RuleConfigEditorProps) {
  const config = pass.ruleConfig ?? {};
  const fields = ruleFields(config);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.key, fieldText(config, field.key)])),
  );

  const save = () => {
    let next = config;
    for (const field of fields) {
      next = applyFieldText(next, field.key, drafts[field.key] ?? "");
    }
    onSave(next);
  };

  return (
    <div className="space-y-3 bg-sunk/70 px-4 py-3">
      {fields.map((field) => (
        <FieldEditor
          key={field.key}
          field={field}
          value={drafts[field.key] ?? ""}
          onChange={(value) => setDrafts((current) => ({ ...current, [field.key]: value }))}
        />
      ))}
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded bg-ink px-3 py-1 text-xs font-medium text-on-ink hover:bg-quiet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          onClick={save}
        >
          Save
        </button>
        <button
          type="button"
          className="rounded border border-rule bg-paper px-3 py-1 text-xs font-medium text-quiet-ink hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface FieldEditorProps {
  field: RuleField;
  value: string;
  onChange: (value: string) => void;
}

function FieldEditor({ field, value, onChange }: FieldEditorProps) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-quiet-ink">{field.label}</span>
      {field.kind === "number" ? (
        <input
          type="number"
          min={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 w-24 rounded border border-rule bg-paper px-2 py-1 text-sm focus:border-rule-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      ) : (
        <textarea
          rows={field.kind === "pairs" ? 6 : 5}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          className="mt-1 w-full resize-y rounded border border-rule bg-paper px-2 py-1.5 font-mono text-xs focus:border-rule-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      )}
      <span className="mt-0.5 block text-xs text-muted-ink">{field.help}</span>
    </label>
  );
}
