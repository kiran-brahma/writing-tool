import { useState } from "react";
import type { Pass, RuleConfig } from "../core/pass";
import { applyFieldText, fieldText, ruleFields, type RuleField } from "./ruleConfigText";

/**
 * Stories 34 and 35: the Writer edits the word lists and patterns behind each
 * rule Pass, and can turn any one of them off. The panel is data editing, not
 * prose editing — nothing here can insert a word into the Document. An exclusive
 * Pass, when it is on, holds the others, and the panel says so and tags each
 * held Pass rather than pretending they are off.
 */
export interface RulePassesPanelProps {
  passes: Pass[];
  onToggle: (passId: string, enabled: boolean) => void;
  onSaveConfig: (passId: string, ruleConfig: RuleConfig) => void;
}

export function RulePassesPanel({ passes, onToggle, onSaveConfig }: RulePassesPanelProps) {
  const rulePasses = passes.filter((pass) => pass.kind === "rule");
  /** The exclusive rule Pass that is on, whose fellows are held while it runs. */
  const solo = rulePasses.find((pass) => pass.exclusive === true && pass.enabled) ?? null;
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <section className="border-b border-stone-200">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2">
        <h2 className="text-sm font-semibold">Rule passes</h2>
        <span className="text-xs text-stone-500">free, offline</span>
      </div>
      {solo !== null && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {solo.name} runs on its own. The other rule passes are held while it is on; turn it off
          to run them again.
        </p>
      )}
      <ul>
        {rulePasses.map((pass) => {
          const held = solo !== null && pass.id !== solo.id;
          return (
            <li key={pass.id} className="border-b border-stone-200/70 last:border-b-0">
              <div className="flex items-start gap-2 px-4 py-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={pass.enabled}
                  aria-label={`Enable ${pass.name}`}
                  onChange={(event) => onToggle(pass.id, event.target.checked)}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      pass.enabled && !held ? "text-sm text-stone-800" : "text-sm text-stone-400"
                    }
                  >
                    {pass.name}
                    {held && (
                      <span className="ml-1.5 rounded bg-stone-200 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-500">
                        held
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500">{pass.description}</p>
                </div>
                <button
                  type="button"
                  className="rounded border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100"
                  onClick={() => setEditingId((current) => (current === pass.id ? null : pass.id))}
                >
                  {editingId === pass.id ? "Close" : "Edit"}
                </button>
              </div>
              {editingId === pass.id && (
                <RuleConfigEditor
                  key={pass.id}
                  pass={pass}
                  onSave={(ruleConfig) => {
                    onSaveConfig(pass.id, ruleConfig);
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface RuleConfigEditorProps {
  pass: Pass;
  onSave: (ruleConfig: RuleConfig) => void;
  onCancel: () => void;
}

function RuleConfigEditor({ pass, onSave, onCancel }: RuleConfigEditorProps) {
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
    <div className="space-y-3 bg-stone-100/70 px-4 py-3">
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
          className="rounded bg-stone-900 px-3 py-1 text-xs font-medium text-stone-50 hover:bg-stone-700"
          onClick={save}
        >
          Save
        </button>
        <button
          type="button"
          className="rounded border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100"
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
      <span className="text-xs font-medium text-stone-700">{field.label}</span>
      {field.kind === "number" ? (
        <input
          type="number"
          min={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 w-24 rounded border border-stone-300 bg-white px-2 py-1 text-sm focus:border-stone-500 focus:outline-none"
        />
      ) : (
        <textarea
          rows={field.kind === "pairs" ? 6 : 5}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          className="mt-1 w-full resize-y rounded border border-stone-300 bg-white px-2 py-1.5 font-mono text-xs focus:border-stone-500 focus:outline-none"
        />
      )}
      <span className="mt-0.5 block text-xs text-stone-500">{field.help}</span>
    </label>
  );
}
