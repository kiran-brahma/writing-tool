import { useCallback, useRef, useState, type RefObject } from "react";
import { reResolveFindings, type FindingInterval, type FindingResolution } from "../core/anchor";
import type { DeclineReason, Finding } from "../core/finding";
import { openFindingsInPass } from "../core/finding";
import type { Pass } from "../core/pass";
import { describeError } from "../errors";
import {
  declineFinding,
  markFindingAddressed,
  reopenFinding,
  resolveDocumentFindings,
} from "../storage/findings";
import type { DocumentRecord, ObelusDatabase } from "../storage/obelusDatabase";
import { listRevisions } from "../storage/revisions";
import { runRulePasses } from "../storage/ruleRuns";

export interface FindingsOptions {
  databaseRef: RefObject<ObelusDatabase | null>;
  documentRef: RefObject<DocumentRecord | null>;
  passesRef: RefObject<Pass[]>;
  voiceListRef: RefObject<string[]>;
  /** Surfaces a status write failure; never a silent failure. */
  onError: (message: string) => void;
}

/**
 * The Finding queue and the Revision list for the current Document: resolution
 * against the canonical string, the Highlight intervals the Editor draws, the
 * status writes that move a Finding between open, addressed and declined, and
 * the rule re-run that a Pass or Voice-list change triggers.
 */
export interface FindingsHandle {
  findings: Finding[];
  /** Canonical intervals of open Findings, each tied to its Finding, for the Editor to draw. */
  highlights: FindingInterval[];
  revisions: import("../storage/obelusDatabase").RevisionRecord[];
  /** The Finding queue, read synchronously by the status writes. */
  findingsRef: RefObject<Finding[]>;
  /** Canonical strings of the provenance Revisions the stored Findings name. */
  canonicalsRef: RefObject<Map<string, string>>;
  applyResolution: (resolution: FindingResolution) => void;
  refreshFindings: (document?: DocumentRecord | null) => Promise<void>;
  refreshRevisions: () => Promise<void>;
  /** Re-runs the enabled rule Passes against the current Document. */
  rerunRules: () => Promise<void>;
  /** Writes a status, returning whether it was stored. Failures surface via `onError`. */
  markAddressed: (findingId: string) => Promise<boolean>;
  /** Stories 64 and 72: decline a Finding, recording why — `advice` or `violation`. */
  decline: (findingId: string, reason?: DeclineReason) => Promise<boolean>;
  /** Stories 179–182: decline every open Finding in one Pass in one action. */
  declineRestOfPass: (passId: string) => Promise<boolean>;
  /** Story 181: return a Finding to the queue, clearing any declineReason. */
  reopen: (findingId: string) => Promise<boolean>;
}

export function useFindings(options: FindingsOptions): FindingsHandle {
  const { databaseRef, documentRef, passesRef, voiceListRef, onError } = options;
  const findingsRef = useRef<Finding[]>([]);
  const canonicalsRef = useRef<Map<string, string>>(new Map());
  const [findings, setFindings] = useState<Finding[]>([]);
  const [highlights, setHighlights] = useState<FindingInterval[]>([]);
  const [revisions, setRevisions] = useState<FindingsHandle["revisions"]>([]);

  /**
   * The Findings and the intervals the Editor should draw. Resolution happened
   * in Core against the canonical string the Run saw; the Editor only projects
   * and draws the intervals. A Finding that has left the queue — addressed or
   * declined — draws no Highlight, so the prose shows what still needs work
   * rather than a growing residue.
   */
  const applyResolution = useCallback((resolution: FindingResolution) => {
    findingsRef.current = resolution.findings;
    setFindings(resolution.findings);
    setHighlights(resolution.highlights);
  }, []);

  /**
   * Re-resolves the Document's stored Findings against the given canonical
   * string — diff-projecting each from its provenance Revision — persists any
   * `anchor.state` change and applies the result. This is the storage-touching
   * path, used on open, on save, after a rule or model Run, and after a status
   * write. `handleChange` re-resolves in memory directly so a Highlight follows
   * the text as the Writer types.
   */
  const refreshFindings = useCallback(
    async (document: DocumentRecord | null = documentRef.current) => {
      const database = databaseRef.current;
      if (database === null || document === null) return;
      const resolution = await resolveDocumentFindings(database, document);
      canonicalsRef.current = resolution.canonicals;
      // A keystroke during the await may have advanced the Document. Apply
      // against the latest text rather than clobbering a newer Highlight with
      // intervals computed for the text that was persisted.
      const latest = documentRef.current ?? document;
      applyResolution(
        latest.canonical === document.canonical
          ? resolution
          : reResolveFindings(resolution.findings, latest.canonical, (id) =>
              resolution.canonicals.get(id),
            ),
      );
    },
    [databaseRef, documentRef, applyResolution],
  );

  const refreshRevisions = useCallback(async () => {
    const database = databaseRef.current;
    const current = documentRef.current;
    if (database === null || current === null) return;
    setRevisions(await listRevisions(database, current.id));
  }, [databaseRef, documentRef]);

  /** Re-runs the enabled rule Passes against the current Document. */
  const rerunRules = useCallback(async () => {
    const database = databaseRef.current;
    const current = documentRef.current;
    if (database === null || current === null) return;
    await runRulePasses(database, current, {
      passes: passesRef.current,
      voiceList: voiceListRef.current,
    });
    await refreshFindings(current);
    await refreshRevisions();
  }, [databaseRef, documentRef, passesRef, voiceListRef, refreshFindings, refreshRevisions]);

  /**
   * Writes a status through storage, then reflects it in the queue and
   * Highlights. A failure is surfaced like any other save failure rather than
   * swallowed, and `false` tells the caller not to advance the selection.
   */
  const applyStatus = useCallback(
    async (
      write: (database: ObelusDatabase, findingId: string) => Promise<Finding | null>,
      findingId: string,
    ): Promise<boolean> => {
      const database = databaseRef.current;
      if (database === null) return false;

      try {
        const updated = await write(database, findingId);
        if (updated === null) return false;
        // The status write changed which Findings are open, so re-resolve from
        // storage: a Finding that left the queue drops its Highlight, and an
        // Orphaned one stays put rather than reappearing attached.
        await refreshFindings();
        return true;
      } catch (error) {
        onError(describeError(error));
        return false;
      }
    },
    [databaseRef, refreshFindings, onError],
  );

  const markAddressed = useCallback(
    (findingId: string) => applyStatus(markFindingAddressed, findingId),
    [applyStatus],
  );

  const decline = useCallback(
    (findingId: string, reason: DeclineReason = "advice") =>
      applyStatus((database, id) => declineFinding(database, id, reason), findingId),
    [applyStatus],
  );

  /**
   * Stories 179 and 180: declines the remaining open Findings in one Pass. The
   * set is the pure `openFindingsInPass`, and each Finding is written through
   * the same storage entry point a single decline uses, with `advice` — never
   * `violation`, which is an assertion about the model that cannot responsibly
   * be made for a whole Pass at once. One refresh follows, so the queue and
   * Highlights settle once.
   */
  const declineRestOfPass = useCallback(
    async (passId: string): Promise<boolean> => {
      const database = databaseRef.current;
      if (database === null) return false;
      const targets = openFindingsInPass(findingsRef.current, passId);
      if (targets.length === 0) return false;

      try {
        for (const finding of targets) {
          await declineFinding(database, finding.id, "advice");
        }
        await refreshFindings();
        return true;
      } catch (error) {
        onError(describeError(error));
        return false;
      }
    },
    [databaseRef, refreshFindings, onError],
  );

  /** Story 181: returns a Finding to `open`, and the status write clears the reason. */
  const reopen = useCallback(
    (findingId: string) => applyStatus(reopenFinding, findingId),
    [applyStatus],
  );

  return {
    findings,
    highlights,
    revisions,
    findingsRef,
    canonicalsRef,
    applyResolution,
    refreshFindings,
    refreshRevisions,
    rerunRules,
    markAddressed,
    decline,
    declineRestOfPass,
    reopen,
  };
}
