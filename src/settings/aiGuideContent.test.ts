import { describe, expect, it } from "vitest";
import { DEFAULT_CHARACTER_LIMIT } from "../core/chunking";
import {
  CONNECTION_PREFILLS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  OLLAMA_MAX_OUTPUT_TOKENS,
} from "../wire/connection";
import { aiGuideSections, type GuideBlock, type GuideSection } from "./aiGuideContent";

function blockText(block: GuideBlock): string[] {
  switch (block.kind) {
    case "p":
    case "code":
      return [block.text];
    case "steps":
    case "list":
      return [...block.items];
    case "table":
      return [...block.head, ...block.rows.flat()];
    case "sub":
      return [block.heading, ...block.blocks.flatMap(blockText)];
  }
}

function prose(sections: readonly GuideSection[]): string {
  return sections
    .flatMap((section) => [section.heading, ...section.blocks.flatMap(blockText)])
    .join("\n");
}

const DEPLOYED = "https://obelus.example.com";

describe("the AI guide", () => {
  it("names every prefilled Connection's base URL, so a changed prefill cannot go stale", () => {
    const text = prose(aiGuideSections(DEPLOYED));
    for (const prefill of CONNECTION_PREFILLS) {
      expect(text).toContain(prefill.baseUrl);
    }
  });

  it("quotes the defaults the app enforces", () => {
    const text = prose(aiGuideSections(DEPLOYED));
    expect(text).toContain(String(DEFAULT_MAX_OUTPUT_TOKENS));
    expect(text).toContain(String(OLLAMA_MAX_OUTPUT_TOKENS));
    expect(text).toContain(DEFAULT_CHARACTER_LIMIT.toLocaleString("en-US"));
  });

  it("fills this site into the Ollama allow commands on a deployed page", () => {
    const text = prose(aiGuideSections(DEPLOYED));
    expect(text).toContain(`launchctl setenv OLLAMA_ORIGINS "${DEPLOYED}"`);
    expect(text).toContain(`setx OLLAMA_ORIGINS "${DEPLOYED}"`);
    expect(text).toContain(`Environment="OLLAMA_ORIGINS=${DEPLOYED}"`);
  });

  it("tells a page served from this machine it needs no OLLAMA_ORIGINS", () => {
    const text = prose(aiGuideSections("http://localhost:5173"));
    expect(text).not.toContain("launchctl setenv");
    expect(text).toContain("You do not need to set `OLLAMA_ORIGINS`");
  });

  it("routes Ollama cloud models through the local daemon, never ollama.com with a key", () => {
    const text = prose(aiGuideSections(DEPLOYED));
    expect(text).toContain("ollama signin");
    expect(text).toContain(":cloud");
    expect(text).toMatch(/pointed at `https:\/\/ollama\.com` always fails/);
  });

  it("labels every section with one mode and gives each a unique anchor", () => {
    const sections = aiGuideSections(DEPLOYED);
    const ids = sections.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of sections) {
      expect(["How-to", "Reference", "Explanation"]).toContain(section.mode);
    }
  });

  it("addresses the reader as you, with no first-person plural", () => {
    const text = prose(aiGuideSections(DEPLOYED));
    expect(text).not.toMatch(/\b(we|our|us)\b/i);
  });
});
