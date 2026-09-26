import { describe, expect, it } from "vitest";
import {
  clicksBetween,
  currentDestination,
  DESTINATIONS,
  destinationsAt,
  isCurrentDestination,
  isHelpCurrent,
  type DestinationId,
} from "./navigation";

describe("destination model", () => {
  it("covers all six destinations with the expected labels in persistent order", () => {
    expect(DESTINATIONS).toHaveLength(6);
    expect(DESTINATIONS).toEqual([
      { id: "editor", label: "Editor", placement: "tab" },
      { id: "library", label: "Library", placement: "tab" },
      { id: "workbench", label: "Pass workbench", placement: "link" },
      { id: "settings", label: "AI Settings", placement: "link" },
      { id: "help", label: "How this works", placement: "help" },
      { id: "privacy", label: "Privacy", placement: "help" },
    ]);
  });

  it("makes Editor and Library the tabs, the tools quieter links, and help one control", () => {
    expect(destinationsAt("tab").map((d) => d.id)).toEqual(["editor", "library"]);
    expect(destinationsAt("link").map((d) => d.id)).toEqual(["workbench", "settings"]);
    expect(destinationsAt("help").map((d) => d.id)).toEqual(["help", "privacy"]);
  });

  it("reaches every destination from every other in at most two clicks", () => {
    for (const from of DESTINATIONS) {
      for (const to of DESTINATIONS) {
        const clicks = clicksBetween(from.id, to.id);
        expect(clicks).toBeLessThanOrEqual(2);
        expect(clicks === 0).toBe(from.id === to.id);
      }
    }
  });

  it("costs one click for a tab or a link and two for a destination under help", () => {
    expect(clicksBetween("privacy", "editor")).toBe(1);
    expect(clicksBetween("help", "library")).toBe(1);
    expect(clicksBetween("editor", "workbench")).toBe(1);
    expect(clicksBetween("library", "settings")).toBe(1);
    expect(clicksBetween("editor", "help")).toBe(2);
    expect(clicksBetween("help", "privacy")).toBe(2);
  });

  it("marks the help control current only while How this works or Privacy is open", () => {
    expect(DESTINATIONS.filter((d) => isHelpCurrent(d.id)).map((d) => d.id)).toEqual([
      "help",
      "privacy",
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
