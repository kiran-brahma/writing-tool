import type { Interval } from "./finding";

/**
 * The Target a Run is asked about: the text, its half-open interval in the
 * whole Document's canonical string, and the context a local Pass is allowed to
 * see. The canonical string is the one coordinate system, so Containment
 * measures the model's Anchors against the same string every other feature
 * uses.
 */
export interface Target {
  /** The whole Document's canonical string. */
  canonical: string;
  /** The Target's half-open interval within `canonical`. */
  interval: Interval;
  /** The Target's canonical source. */
  text: string;
  title: string;
  outline: string;
  contextAbove: string;
  contextBelow: string;
  /**
   * The value of the `{{document}}` placeholder: the whole Document for a
   * structural (document-scope) Pass, and empty for a paragraph- or
   * section-scope Pass, which never receives body text beyond its Target.
   */
  documentText: string;
}
