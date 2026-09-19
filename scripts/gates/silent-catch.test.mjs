import { describe, expect, it } from "vitest";
import { findSilentCatches } from "./silent-catch.mjs";

describe("findSilentCatches", () => {
  it.each([
    ["re-raises the error", "try { go(); } catch (error) { throw error; }", 0],
    ["handles the error", "try { go(); } catch (error) { report(error); }", 0],
    ["returns a sentinel value", "try { go(); } catch { return null; }", 0],
    ["states in a comment why it is ignored", "try { go(); } catch { /* the probe is optional */ }", 0],
    ["rethrows, ignoring the binding", "try { go(); } catch { throw new Error('replaced'); }", 0],
    ["swallows with an empty block", "try { go(); } catch (error) {}", 1],
    ["swallows with an empty binding", "try { go(); } catch {}", 1],
    ["swallows with only an empty statement", "try { go(); } catch (error) { ; }", 1],
    ["swallows with a bare return", "try { go(); } catch (error) { return; }", 1],
    ["swallows with a bare continue", "try { go(); } catch (error) { continue; }", 1],
    ["swallows by voiding the error", "try { go(); } catch (error) { void error; }", 1],
    ["swallows by naming the error and dropping it", "try { go(); } catch (error) { error; }", 1],
    ["comments an otherwise empty block", "try { go(); } catch (error) { ; /* optional */ }", 0],
    ["comments a bare return", "try { go(); } catch (error) { return; /* nothing to do */ }", 0],
    [
      "does not mistake a URL string for a comment",
      'try { go(); } catch (error) { void error; "https://example.com"; }',
      1,
    ],
    [
      "accepts a real comment alongside a no-op",
      "try { go(); } catch (error) { void error; /* cold cache is expected */ }",
      0,
    ],
  ])("%s", (_label, source, expected) => {
    expect(findSilentCatches(source, "example.ts")).toHaveLength(expected);
  });

  it("reports the catch line", () => {
    const source = "try {\n  go();\n} catch (error) {}\n";
    const [finding] = findSilentCatches(source, "example.ts");
    expect(finding).toMatchObject({ file: "example.ts", line: 3 });
  });

  it("accepts a same-line block comment inside an otherwise empty catch", () => {
    expect(findSilentCatches("try { go(); } catch (error) { /* optional */ }", "example.ts")).toEqual(
      [],
    );
  });

  it("ignores a catch inside a string literal", () => {
    expect(findSilentCatches('const sample = "try {} catch {}";', "example.ts")).toEqual([]);
  });
});
