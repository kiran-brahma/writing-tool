# Every request leaves the Writer's browser

Obelus is hosted on Cloudflare Workers and has no server route that calls a model provider, so the
only outbound requests are the ones the Writer's browser makes to the Connection they configured.
That is what makes the privacy claim checkable in the network tab rather than merely asserted, and it
rules out a proxy — including one added to reach Ollama Cloud, whose endpoint blocks browser calls
and whose own documentation says to keep API keys out of browser code.

## Considered Options

- **A stateless proxy for the providers that block browsers.** Would make Ollama Cloud work out of the
  box, at the cost of a server that handles the Writer's key. Rejected: it falsifies the one claim
  the whole architecture rests on.

## Consequences

Ollama Cloud is not supported directly. Cloud models remain reachable through a local Ollama daemon
after signing in, with no key in the browser, and a Writer who wants the hosted endpoint can point a
Custom Connection at their own proxy.
