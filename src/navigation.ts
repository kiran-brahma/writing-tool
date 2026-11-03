/**
 * The three persistent destinations of Obelus: Editor, Library and Settings.
 *
 * Navigation is persistent across every destination, so no view needs to
 * remember where it was entered from and the app needs no "Back to..." buttons.
 * Help and Privacy are sections inside Settings rather than destinations of
 * their own.
 */
export type DestinationId = "editor" | "library" | "settings";

export interface Destination {
  readonly id: DestinationId;
  readonly label: string;
}

export const DESTINATIONS: readonly Destination[] = [
  { id: "editor", label: "Editor" },
  { id: "library", label: "Library" },
  { id: "settings", label: "Settings" },
] as const;

export function isCurrentDestination(
  destinationId: DestinationId,
  currentView: DestinationId,
): boolean {
  return destinationId === currentView;
}

/** Looks up the Destination record for a view. */
export function currentDestination(view: DestinationId): Destination {
  const match = DESTINATIONS.find((candidate) => candidate.id === view);
  if (!match) {
    throw new Error(`Unknown destination view: ${view}`);
  }
  return match;
}
