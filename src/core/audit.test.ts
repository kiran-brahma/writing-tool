import { describe, expect, it } from "vitest";
import { AUDIT_SCHEMA } from "./audit";

/**
 * The Audit schema is a constitutional decision, so these read it as data the
 * way `parseFindings.test.ts` reads the Findings schema: no field for rewritten
 * prose anywhere, and closed at every level so a model cannot add one.
 */

/** Every property name the schema declares, at any depth. */
function propertyNames(schema: unknown): string[] {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) return [];
  const node = schema as Record<string, unknown>;
  const names: string[] = [];
  const properties = node.properties;
  if (typeof properties === "object" && properties !== null && !Array.isArray(properties)) {
    for (const [name, child] of Object.entries(properties as Record<string, unknown>)) {
      names.push(name, ...propertyNames(child));
    }
  }
  if (node.items !== undefined) names.push(...propertyNames(node.items));
  return names;
}

/** Every object node that declares `properties`, at any depth. */
function objectNodes(schema: unknown): Record<string, unknown>[] {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) return [];
  const node = schema as Record<string, unknown>;
  const nodes: Record<string, unknown>[] = [];
  const properties = node.properties;
  if (typeof properties === "object" && properties !== null && !Array.isArray(properties)) {
    nodes.push(node);
    for (const child of Object.values(properties as Record<string, unknown>)) {
      nodes.push(...objectNodes(child));
    }
  }
  if (node.items !== undefined) nodes.push(...objectNodes(node.items));
  return nodes;
}

describe("the audit schema", () => {
  it("has no field for rewritten prose", () => {
    expect(JSON.stringify(AUDIT_SCHEMA).toLowerCase()).not.toContain("rewrite");
    expect(JSON.stringify(AUDIT_SCHEMA).toLowerCase()).not.toContain("replacement");
  });

  it("names no rewrite-shaped property at any depth", () => {
    const forbidden = /rewrite|replacement|suggest|revised|newtext|insert/i;
    const names = propertyNames(AUDIT_SCHEMA);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name).not.toMatch(forbidden);
    }
  });

  it("is closed at every object level", () => {
    const nodes = objectNodes(AUDIT_SCHEMA);
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      expect(node.additionalProperties).toBe(false);
    }
  });

  it("exposes the audit fields the spec names", () => {
    const serialized = JSON.stringify(AUDIT_SCHEMA);
    for (const field of [
      "type",
      "corePayload",
      "argumentMap",
      "reasoning",
      "fallacies",
      "definitions",
      "priority",
    ]) {
      expect(serialized).toContain(`"${field}"`);
    }
  });
});
