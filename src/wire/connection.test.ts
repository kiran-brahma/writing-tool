import { describe, expect, it } from "vitest";
import {
  CONNECTION_PREFILLS,
  DEFAULT_CONCURRENCY,
  connectionFromPrefill,
  createCustomConnection,
} from "./connection";

function prefill(id: string) {
  const found = CONNECTION_PREFILLS.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`No prefill "${id}"`);
  return found;
}

describe("prefilled Connections (stories 2–6)", () => {
  it("carries the verified base URL and Protocol for each Provider", () => {
    expect(prefill("openai")).toMatchObject({
      protocol: "openai-shaped",
      baseUrl: "https://api.openai.com/v1",
    });
    expect(prefill("anthropic")).toMatchObject({
      protocol: "anthropic-shaped",
      baseUrl: "https://api.anthropic.com/v1",
    });
    expect(prefill("gemini")).toMatchObject({
      protocol: "gemini-native",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    });
    expect(prefill("openrouter")).toMatchObject({
      protocol: "openai-shaped",
      baseUrl: "https://openrouter.ai/api/v1",
    });
    expect(prefill("ollama")).toMatchObject({
      protocol: "openai-shaped",
      baseUrl: "http://localhost:11434/v1",
    });
  });

  it("prefills Anthropic's required headers so the Writer supplies only a key and model", () => {
    expect(prefill("anthropic").extraHeaders).toEqual({
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
  });

  it("starts a prefilled Connection with no key and no model", () => {
    const connection = connectionFromPrefill(prefill("openai"));
    expect(connection.apiKey).toBe("");
    expect(connection.model).toBe("");
    expect(connection.keyMode).toBe("persisted");
    expect(connection.concurrency).toBe(DEFAULT_CONCURRENCY);
    expect(connection.builtIn).toBe(true);
  });

  it("configures a Custom Connection with an editable base URL (story 7)", () => {
    const custom = createCustomConnection("custom-1");
    expect(custom.builtIn).toBe(false);
    expect(custom.protocol).toBe("openai-shaped");
    expect(custom.baseUrl).not.toBe("");
  });
});
