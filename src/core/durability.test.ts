import { describe, expect, it } from "vitest";
import { BACKUP_STALE_AFTER_MS, backupReminder } from "./durability";

const NOW = 1_700_000_000_000;

describe("backupReminder", () => {
  it("treats never-backed-up as stale", () => {
    expect(backupReminder(null, NOW)).toEqual({ stale: true, label: "Last backed up: never." });
  });

  it("is stale once a backup reaches the threshold", () => {
    expect(backupReminder(NOW - BACKUP_STALE_AFTER_MS, NOW).stale).toBe(true);
  });

  it("is not stale just under the threshold", () => {
    const reminder = backupReminder(NOW - (BACKUP_STALE_AFTER_MS - 1), NOW);
    expect(reminder.stale).toBe(false);
  });

  it("names the age with singular and plural units", () => {
    expect(backupReminder(NOW - 30_000, NOW).label).toBe("Last backed up just now.");
    expect(backupReminder(NOW - 60_000, NOW).label).toBe("Last backed up 1 minute ago.");
    expect(backupReminder(NOW - 3 * 60_000, NOW).label).toBe("Last backed up 3 minutes ago.");
    expect(backupReminder(NOW - 60 * 60_000, NOW).label).toBe("Last backed up 1 hour ago.");
    expect(backupReminder(NOW - 2 * 24 * 60 * 60 * 1000, NOW).label).toBe(
      "Last backed up 2 days ago.",
    );
  });
});
