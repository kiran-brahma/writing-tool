/**
 * The security headers the Worker sets on every response.
 *
 * The CSP is the enforcement point for "no third-party script origin can load":
 * `script-src 'self'` admits no remote script and no inline script. `connect-src`
 * is deliberately broad — a Writer-supplied base URL and a local Ollama origin
 * cannot be enumerated in a static header, so the "only your Connection" property
 * is enforced by the Transport code path and asserted at the seam instead.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src *",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  "worker-src 'self'",
].join("; ");

export const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
});

/**
 * Overwrites the security headers on an asset response. Overwrite rather than
 * append so an asset can never weaken the policy.
 */
export function applySecurityHeaders(headers: Headers): Headers {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return headers;
}
