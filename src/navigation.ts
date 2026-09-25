/**
 * The six persistent destinations of Obelus (spec v1.2, story 190).
 *
 * Navigation is persistent across every destination: clicking a destination
 * moves straight to it, so no view needs to remember where it was entered from
 * and the app needs no "Back to..." buttons.
 */

export type DestinationId =
  | "editor"
  | "library"
  | "workbench"
  | "settings"
  | "help"
  | "privacy";

export interface Destination {
  readonly id: DestinationId;
  readonly label: string;
}

export const DESTINATIONS: readonly Destination[] = [
  { id: "editor", label: "Editor" },
  { id: "library", label: "Library" },
  { id: "workbench", label: "Pass workbench" },
  { id: "settings", label: "AI Settings" },
  { id: "help", label: "How this works" },
  { id: "privacy", label: "Privacy" },
] as const;

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
 * Looks up the Destination record for a view.
 */
export function currentDestination(view: DestinationId): Destination {
  const match = DESTINATIONS.find((candidate) => candidate.id === view);
  if (!match) {
    throw new Error(`Unknown destination view: ${view}`);
  }
  return match;
}
