import { useState } from "react";
import { soloRulePass, type Pass, type RuleConfig } from "../core/pass";
import { RuleConfigEditor } from "./RuleConfigEditor";
import { PANEL_GLOSSES, type HelpSectionId } from "../help/helpContent";

/**
 * Stories 34 and 35: the Writer edits the word lists and patterns behind each
 * rule Pass, and can turn any one of them off. The panel is data editing, not
 * prose editing — nothing here can insert a word into the Document. An exclusive
 * Pass, when it is on, holds the others, and the panel says so and tags each
 * held Pass rather than pretending they are off.
 *
 * This is the Workbench's rule-Pass editor. The rail's word Band renders the same
 * Passes per Pass through `BandPanel`, and both use the shared `RuleConfigEditor`.
 */
export interface RulePassesPanelProps {
  passes: Pass[];
  onToggle: (passId: string, enabled: boolean) => void;
  onSaveConfig: (passId: string, ruleConfig: RuleConfig) => void;
  onOpenHelp?: (sectionId: HelpSectionId) => void;
}

export function RulePassesPanel({
  passes,
  onToggle,
  onSaveConfig,
  onOpenHelp,
}: RulePassesPanelProps) {
  const rulePasses = passes.filter((pass) => pass.kind === "rule");
  /** The exclusive rule Pass that is on, whose fellows are held while it runs. */
  const solo = soloRulePass(passes);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <section className="border-b border-rule-soft">
      <div className="flex items-center justify-between border-b border-rule-soft px-4 py-2">
        <h2 className="text-sm font-semibold">Word — rule passes</h2>
        <span className="text-xs text-muted-ink">free, offline</span>
      </div>

      <p className="border-b border-rule-soft px-4 py-2 text-xs text-muted-ink">
        {PANEL_GLOSSES.rulePasses.text}{" "}
        <button
          type="button"
          onClick={() => onOpenHelp?.(PANEL_GLOSSES.rulePasses.sectionId)}
          className="underline hover:text-soft-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          How this works
        </button>
      </p>
      {solo !== null && (
        <p className="border-b border-warning-rule bg-warning-surface px-4 py-2 text-xs text-warning">
          {solo.name} runs on its own. The other rule passes are held while it is on; turn it off
          to run them again.
        </p>
      )}
      <ul>
        {rulePasses.map((pass) => {
          const held = solo !== null && pass.id !== solo.id;
          return (
            <li key={pass.id} className="border-b border-rule-soft/70 last:border-b-0">
              <div className="flex items-start gap-2 px-4 py-2">
                <input
                  type="checkbox"
                  className="mt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  checked={pass.enabled}
                  aria-label={`Enable ${pass.name}`}
                  onChange={(event) => onToggle(pass.id, event.target.checked)}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      pass.enabled && !held
                        ? "text-sm font-semibold text-ink"
                        : "text-sm font-medium text-muted-ink"
                    }
                  >
                    {pass.name}
                    {held && (
                      <span className="ml-1.5 rounded bg-sunk-strong px-1 py-0.5 text-xs font-medium uppercase tracking-wide text-quiet-ink">
                        held
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-ink">{pass.description}</p>
                  {!pass.enabled && <p className="mt-1 text-xs italic text-muted-ink">Disabled.</p>}
                </div>
                <button
                  type="button"
                  className="rounded border border-rule bg-paper px-2 py-1 text-xs font-medium text-quiet-ink hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
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
