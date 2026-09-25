import { describe, expect, it } from "vitest";
import { findOutboundCalls } from "./worker.mjs";

describe("findOutboundCalls", () => {
  it.each([
    ["the assets binding", "const asset = await env.ASSETS.fetch(request);", 0],
    ["a bare fetch", "const r = await fetch(url);", 1],
    ["a globalThis fetch", "const r = await globalThis.fetch(url);", 1],
    ["another binding's fetch", "const r = await env.MODELS.fetch(request);", 1],
    ["a client named fetch", "const r = await provider.fetch(request);", 1],
    ["an XMLHttpRequest", "const r = new XMLHttpRequest();", 1],
    ["a WebSocket", "const socket = new WebSocket(url);", 1],
    ["an EventSource", "const events = new EventSource(url);", 1],
    ["no network at all", "const headers = applySecurityHeaders(new Headers());", 0],
  ])("flags %s", (_label, source, expected) => {
    expect(findOutboundCalls(source, "worker/index.ts")).toHaveLength(expected);
  });

  it("reports the line of the offending call", () => {
    const source = "export default {\n  async fetch(request, env) {\n    return fetch(request);\n  },\n};\n";
    const [finding] = findOutboundCalls(source, "worker/index.ts");
    expect(finding).toMatchObject({ file: "worker/index.ts", line: 3 });
  });

  it("flags a rebind of the assets binding, and says the gate is a backstop", () => {
    const source = "const assets = env.ASSETS;\nconst response = await assets.fetch(request);";
    // The gate reads source, not data flow: a local rebound from the binding is
    // indistinguishable from any other object, so it is reported and the Worker
    // keeps the direct `env.ASSETS.fetch(request)` form.
    expect(findOutboundCalls(source, "worker/index.ts")).toHaveLength(1);
  });
});
