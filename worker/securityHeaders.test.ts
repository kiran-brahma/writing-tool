import { describe, expect, it } from "vitest";
import { applySecurityHeaders, SECURITY_HEADERS } from "./securityHeaders";

function directive(policy: string, name: string): string | undefined {
  return policy.split("; ").find((part) => part.startsWith(`${name} `));
}

describe("security headers", () => {
  it("allows scripts only from the app's own origin", () => {
    const policy = SECURITY_HEADERS["Content-Security-Policy"];
    expect(directive(policy, "script-src")).toBe("script-src 'self'");
    expect(directive(policy, "default-src")).toBe("default-src 'self'");
  });

  it("sets the standard security headers to known values", () => {
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe("no-referrer");
    expect(SECURITY_HEADERS["Permissions-Policy"]).toContain("camera=()");
  });

  it("overwrites a CSP supplied by the asset response", () => {
    const headers = applySecurityHeaders(
      new Headers({ "content-security-policy": "default-src *" }),
    );
    expect(headers.get("Content-Security-Policy")).toContain("script-src 'self'");
    expect(headers.get("Content-Security-Policy")).not.toContain("default-src *");
  });
});
