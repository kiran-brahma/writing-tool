/**
 * The six persistent destinations of Obelus (spec v1.2, story 190).
 *
 * Navigation is persistent across every destination: clicking a destination
 * moves straight to it, so no view needs to remember where it was entered from
 * and the app needs no "Back to..." buttons.
 *
 * Spec v1.3 (stories 244–247) ranks them in the header: Editor and Library are
 * the tabs, where the work is; the Pass workbench and AI Settings follow as
 * quieter links; How this works and Privacy sit under one help control.
 */

export type DestinationId =
  | "editor"
  | "library"
  | "workbench"
  | "settings"
  | "help"
  | "privacy";

/** Where a destination sits in the header's navigation zone. */
export type DestinationPlacement = "tab" | "link" | "help";

export interface Destination {
  readonly id: DestinationId;
  readonly label: string;
  readonly placement: DestinationPlacement;
}

export const DESTINATIONS: readonly Destination[] = [
  { id: "editor", label: "Editor", placement: "tab" },
  { id: "library", label: "Library", placement: "tab" },
  { id: "workbench", label: "Pass workbench", placement: "link" },
  { id: "settings", label: "AI Settings", placement: "link" },
  { id: "help", label: "How this works", placement: "help" },
  { id: "privacy", label: "Privacy", placement: "help" },
] as const;

/** The destinations at one placement, in persistent order. */
export function destinationsAt(placement: DestinationPlacement): Destination[] {
  return DESTINATIONS.filter((destination) => destination.placement === placement);
}

/**
 * Returns whether a destination is the current view.
 */
export function isCurrentDestination(
  destinationId: DestinationId,
  currentView: DestinationId,
): boolean {
  return destinationId === currentView;
}

/**
 * Whether the help control holds the current view, so it reads as the Writer's
 * place while How this works or Privacy is open.
 */
export function isHelpCurrent(currentView: DestinationId): boolean {
  return currentDestination(currentView).placement === "help";
}

/**
 * Story 247: the clicks the header needs to move from one destination to
 * another. The header is on every destination, so the cost depends only on
 * where the target sits: a tab or a link is one click, a destination under the
 * help control two (open it, choose). Staying put costs nothing.
 */
export function clicksBetween(from: DestinationId, to: DestinationId): 0 | 1 | 2 {
  if (from === to) return 0;
  return currentDestination(to).placement === "help" ? 2 : 1;
}

/**
 * Looks up the Destination record for a view.
 */
export function currentDestination(view: DestinationId): Destination {
  const match = DESTINATIONS.find((candidate) => candidate.id === view);
  if (!match) {
    throw new Error(`Unknown destination view: ${view}`);
  }
  return match;
}
