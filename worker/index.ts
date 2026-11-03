import { applySecurityHeaders } from "./securityHeaders";

interface Env {
  ASSETS: Fetcher;
}

/**
 * The only Worker code Obelus runs. It serves the static build and stamps the
 * security headers on every response. There is no API route, and there must
 * never be one: every request to a provider leaves from the Writer's browser.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let asset: Response;
    try {
      asset = await env.ASSETS.fetch(request);
    } catch {
      // Serve the failure ourselves rather than letting the platform error page
      // out, so even a 500 still carries the CSP.
      return new Response("Obelus could not serve that page.", {
        status: 500,
        headers: applySecurityHeaders(
          new Headers({ "Content-Type": "text/plain; charset=utf-8" }),
        ),
      });
    }

    const headers = applySecurityHeaders(new Headers(asset.headers));
    // A deploy must be picked up on the next navigation. Hashed assets can stay
    // immutable; the HTML shell and navigations revalidate.
    if ((asset.headers.get("Content-Type") ?? "").includes("text/html")) {
      headers.set("Cache-Control", "no-cache");
    }
    return new Response(asset.body, {
      status: asset.status,
      statusText: asset.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
