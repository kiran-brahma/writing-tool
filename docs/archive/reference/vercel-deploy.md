# Deploying to Vercel (optional, unsupported)

**Obelus deploys to Cloudflare Workers.** That is the supported target, and
`DESIGN.md` §1 names it as a constraint: the Worker serves the static build and
stamps the security headers, and there is no API route.

This directory exists because Vercel also works, if you would rather use it. It
is a **reference, not a supported path** — nothing in the repository builds,
tests or deploys against it, and the Cloudflare Worker is what the project is
developed against.

## Using it

1. Copy `vercel.json` from this directory to the repository root.
2. `pnpm install`, then deploy with `npx vercel --prod` (or connect the
   repository in the Vercel dashboard; the config supplies the build command).

## What changes

On Vercel the Worker does **not** run, so it cannot stamp the security headers
from `worker/securityHeaders.ts`. `vercel.json` supplies the same headers as a
static configuration instead. Two consequences:

- The Content-Security-Policy is a **copy**, declared in two languages. `pnpm run
  gates` fails the build if the two copies drift (`scripts/gates/headers.mjs`),
  so keep them equal.
- The `connect-src *` directive is deliberately broad on both targets: a
  writer-supplied base URL and a local Ollama origin cannot be enumerated in a
  static header. The "requests go only to your connection" property is enforced
  by `src/wire/transport.ts` (`assertWithinConnection`), not by the header, so it
  holds on any host.

## What does not change

Everything that matters to the tool's promises: there is still no server
storage, no account and no telemetry, because the app talks to the provider from
the browser and keeps the Library in IndexedDB. The host only serves files.
