import { describe, expect, it } from "vitest";
import {
  currentDestination,
  DESTINATIONS,
  isCurrentDestination,
  type DestinationId,
} from "./navigation";

describe("destination model", () => {
  it("covers all six destinations with the expected labels in persistent order", () => {
    expect(DESTINATIONS).toHaveLength(6);
    expect(DESTINATIONS).toEqual([
      { id: "editor", label: "Editor" },
      { id: "library", label: "Library" },
      { id: "workbench", label: "Pass workbench" },
      { id: "settings", label: "AI Settings" },
      { id: "help", label: "How this works" },
      { id: "privacy", label: "Privacy" },
    ]);
  });

  it("ensures all destination IDs and labels are unique and non-empty", () => {
    const ids = DESTINATIONS.map((d) => d.id);
    const labels = DESTINATIONS.map((d) => d.label);

    expect(new Set(ids).size).toBe(DESTINATIONS.length);
    expect(new Set(labels).size).toBe(DESTINATIONS.length);

    for (const d of DESTINATIONS) {
      expect(d.id.trim()).not.toBe("");
      expect(d.label.trim()).not.toBe("");
    }
  });

  it("indicates which destination is current for a given view", () => {
    const views = DESTINATIONS.map((d) => d.id);

    for (const view of views) {
      const current = currentDestination(view);
      expect(current.id).toBe(view);

      // Verify isCurrentDestination flags only this view
      for (const candidate of DESTINATIONS) {
        const expected = candidate.id === view;
        expect(isCurrentDestination(candidate.id, view)).toBe(expected);
      }
    }
  });

  it("fails when asked for an unrecognised destination view", () => {
    expect(() => currentDestination("unknown" as DestinationId)).toThrow(
      "Unknown destination view: unknown",
    );
  });
});
