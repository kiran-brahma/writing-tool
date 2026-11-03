import { describe, expect, it } from "vitest";
import {
  currentDestination,
  DESTINATIONS,
  isCurrentDestination,
} from "./navigation";

describe("navigation", () => {
  it("offers exactly three destinations", () => {
    expect(DESTINATIONS.map((destination) => destination.id)).toEqual([
      "editor",
      "library",
      "settings",
    ]);
  });

  it("marks the current destination", () => {
    expect(isCurrentDestination("editor", "editor")).toBe(true);
    expect(isCurrentDestination("library", "editor")).toBe(false);
  });

  it("looks a destination up by id", () => {
    expect(currentDestination("settings").label).toBe("Settings");
    expect(() => currentDestination("missing" as never)).toThrow(/unknown destination/i);
  });
});
