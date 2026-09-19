# Provider API facts for calling five LLM providers directly from a browser

Purpose: the exact, primary-source facts needed to write client-side JavaScript that calls each
provider's HTTP API with `fetch` (no backend proxy). Every non-obvious claim is cited to an official
doc URL (or an official SDK source file). Verified **2026-09-19** by fetching the official docs
listed at the end of each section. No application code is written here.

Method note:
- Facts come from official docs (OpenAI `developers.openai.com`, Anthropic `platform.claude.com` /
  `docs.anthropic.com`, Google `ai.google.dev` + the live Discovery document, OpenRouter
  `openrouter.ai/docs`, Ollama `docs.ollama.com`), plus official SDK repositories where a header is
  only documented in code.
- **CORS was verified empirically** by sending a real `OPTIONS` preflight and a real `POST` with an
  `Origin` header to each live endpoint (curl). Those results are labelled "observed". They are
  server behavior, not doc text.

---

## At-a-glance: does direct-from-browser work?

| Provider | Endpoint called from browser | Auth from browser | CORS preflight (observed) | Docs position on client-side keys |
|---|---|---|---|---|
| OpenAI | `POST https://api.openai.com/v1/chat/completions` | `Authorization: Bearer` | Supported (`200`, origin echoed, headers/auth allowed) | "Don't ... expose it in any client-side code such as browsers or apps" |
| Anthropic | `POST https://api.anthropic.com/v1/messages` | `x-api-key` (or Bearer) + `anthropic-version` | Supported (`200`, `access-control-allow-origin: *`) | SDK supports browser only via `dangerouslyAllowBrowser: true`; **no CORS for ZDR orgs** |
| Gemini | `POST .../v1beta/models/{model}:generateContent` **or** `POST .../v1beta/openai/chat/completions` | `x-goog-api-key` (native) or `Authorization: Bearer` (OpenAI-compat) | Supported (`200`, origin echoed) | "run a backend proxy server to make the actual API calls" |
| OpenRouter | `POST https://openrouter.ai/api/v1/chat/completions` | `Authorization: Bearer` | Supported (`204`, `access-control-allow-origin: *`) | Keys can live in the browser for user-key (PKCE) flows, but "keep [unlimited keys] out of client-side code" |
| Ollama Cloud | `POST https://ollama.com/api/chat` **or** `POST https://ollama.com/v1/chat/completions` | `Authorization: Bearer` | **Not supported** (`OPTIONS` → `405 Method Not Allowed`, no CORS headers) | "Keep your API key out of browser code and source control" |

**Bottom line:** OpenAI, Anthropic, Gemini and OpenRouter all answer a browser CORS preflight, so a
client-side `fetch` can technically reach them. Ollama Cloud does **not** answer preflight
(`OPTIONS` returns `405`), and `Authorization`/`application/json` are non-simple requests that
force a preflight, so a stock browser `fetch` cannot call Ollama Cloud directly. Every provider's
docs warn that shipping a key in client code exposes it.

---

## 1. OpenAI (`api.openai.com`)

### Base URL and endpoint
- API base (from the official OpenAPI spec `servers`): `https://api.openai.com/v1`
  — <https://github.com/openai/openai-openapi/blob/master/openapi.yaml> (`servers: - url: https://api.openai.com/v1`).
- Chat Completions: `POST /v1/chat/completions` → full URL `https://api.openai.com/v1/chat/completions`
  — <https://developers.openai.com/api/reference/chat-completions/overview.md>.
- OpenAI now recommends the **Responses API** for new projects: `POST /v1/responses`
  — "**Starting a new project?** We recommend trying Responses" <https://developers.openai.com/api/reference/chat-completions/overview.md>;
  "If you're building any text generation app, we recommend using the Responses API over the older
  Chat Completions API" <https://developers.openai.com/api/docs/guides/text.md>.

### Auth
- `Authorization: Bearer <OPENAI_API_KEY>` ("Provide API credentials with HTTP Bearer
  authentication")
  — <https://developers.openai.com/api/reference/overview.md> (API Overview → Authentication).
- The spec's security scheme is `type: http, scheme: bearer`
  — <https://github.com/openai/openai-openapi/blob/master/openapi.yaml>.

### Extra headers for browser use
- None required.
- Optional only when you belong to multiple orgs/legacy projects: `OpenAI-Organization`,
  `OpenAI-Project`
  — <https://developers.openai.com/api/reference/overview.md>.
- Optional tracing: `X-Client-Request-Id`.
- No CORS-enabling header exists (unlike Anthropic's).

### CORS / client-side warnings
- Docs do **not** contain an explicit "CORS is supported" statement. They warn the other way:
  "**Remember that your API key is a secret.** Don't share it with others or expose it in any
  client-side code such as browsers or apps. Load API keys from an environment variable or key
  management service on the server."
  — <https://developers.openai.com/api/reference/overview.md> (API Overview → Authentication);
  see also <https://developers.openai.com/api/docs/guides/production-best-practices.md>.
- **Observed CORS (live, 2026-09-19):**
  - `OPTIONS https://api.openai.com/v1/chat/completions` with `Origin: https://example.com` →
    `HTTP/2 200`, `access-control-allow-origin: https://example.com`,
    `access-control-allow-headers: authorization,content-type`,
    `access-control-allow-methods: GET, OPTIONS, POST`, `access-control-max-age: 86400`.
  - A real `POST` with a bad key returned `401` and **no** `access-control-allow-origin` header.
    Practical consequence: the preflight passes, but error responses may not be readable from JS
    (a browser will surface an opaque CORS/network failure rather than the JSON error). With a valid
    key the request itself is allowed.

### Official SDK in browser
- Official `openai` npm SDK: "Web browsers: disabled by default to avoid exposing your secret API
  credentials. Enable browser support by explicitly setting `dangerouslyAllowBrowser` to `true`."
  — <https://github.com/openai/openai-node/blob/master/README.md> (Requirements → runtime list).
- Raw `fetch` is not required; the SDK works in browsers once `dangerouslyAllowBrowser: true` is set.

### Request body shape
Fields sourced from the official spec (`CreateChatCompletionRequest` in
<https://github.com/openai/openai-openapi/blob/master/openapi.yaml>) and the reference pages.

| Concern | OpenAI Chat Completions field |
|---|---|
| System prompt | A message in `messages[]` with `role: "system"`. For o1 models and newer, use `role: "developer"` instead ("`developer` messages replace the previous `system` messages"). Source: `ChatCompletionRequestDeveloperMessage` / `ChatCompletionRequestSystemMessage` in the OpenAPI spec. |
| Max output tokens | `max_completion_tokens` (preferred). `max_tokens` still exists but is "now deprecated in favor of `max_completion_tokens`". |
| Temperature | `temperature`, number `0`–`2`, default `1`. (in `ModelResponseProperties`) |
| Nucleus sampling | `top_p`, number `0`–`1`, default `1`. |
| Stop sequences | `stop`: a string **or** an array of up to 4 strings. "Not supported with latest reasoning models `o3` and `o4-mini`." |
| Streaming | `stream: true` (+ `stream_options: {include_usage: true}` for a final usage chunk). |
| Other | `frequency_penalty`, `presence_penalty`, `seed`, `logprobs`, `top_logprobs`, `tools`, `tool_choice`, `n`. |

Example (illustrative):
```json
{
  "model": "gpt-6-astra",
  "messages": [{ "role": "developer", "content": "You are terse." },
               { "role": "user", "content": "Hi" }],
  "max_completion_tokens": 256,
  "temperature": 0.7
}
```

### Streaming format and delta path
- SSE (`text/event-stream`), one JSON object per `data:` line.
- Each chunk: `object: "chat.completion.chunk"`.
- **Streamed text path: `choices[0].delta.content`**
  — <https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events.md>
  (Example shows `{"choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}`).
- Finish marker: `choices[0].finish_reason` becomes `"stop"` / `"length"` / `"tool_calls"` / etc.
- **Terminator: `data: [DONE]`.**
  - Documented in the spec's `ChatCompletionStreamOptions.include_usage`: "an additional chunk will
    be streamed before the `data: [DONE]` message"
    — <https://github.com/openai/openai-openapi/blob/master/openapi.yaml>.
  - Implemented in the official SDK: `if (sse.data === '[DONE]') break;`
    — <https://github.com/openai/openai-node/blob/master/src/core/streaming.ts>.
- Responses API streams a *different* event shape (named events like `response.output_text.delta`,
  `response.completed`) — not OpenAI-style chunks
  — <https://developers.openai.com/api/docs/guides/streaming-responses.md>.

### Structured JSON output
- Chat Completions: `response_format`
  - `{ "type": "json_schema", "json_schema": { "name": "...", "description": "...", "schema": { ... }, "strict": true } }`
    → "Structured Outputs which ensures the model will match your supplied JSON schema".
  - `{ "type": "json_object" }` → older JSON mode.
  - Source (exact shape): `ResponseFormatJsonSchema` / `ResponseFormatJsonObject` in
    <https://github.com/openai/openai-openapi/blob/master/openapi.yaml>.
- The current guide is written around the Responses API (`text: { format: { type: "json_schema", ... } }`)
  — <https://developers.openai.com/api/docs/guides/structured-outputs.md>.

### Model ID conventions / examples
IDs are plain slugs: `gpt-6-astra` (flagship), `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`,
`gpt-5.2`, `o3`
— <https://developers.openai.com/api/docs/models.md>.

---

## 2. Anthropic (`api.anthropic.com`)

### Base URL and endpoint
- "The Claude API is a RESTful API at `https://api.anthropic.com`"
  — <https://platform.claude.com/docs/en/api/overview> (also served at
  <https://docs.anthropic.com/en/api/overview>).
- Messages: `POST /v1/messages` → `https://api.anthropic.com/v1/messages`
  — <https://platform.claude.com/docs/en/api/messages>.

### Auth and required headers
From the API overview authentication table
(<https://platform.claude.com/docs/en/api/overview>):

| Header | Value | Required |
|---|---|---|
| `x-api-key` | Your API key from Console. "Legacy fallback for `Authorization`, still supported" | No (either this or Authorization) |
| `Authorization` | `Bearer <token>` (API key or short-lived OAuth access token) | Yes, unless `x-api-key` is set |
| `anthropic-version` | e.g. `2023-06-01` | **Yes** |
| `content-type` | `application/json` | Yes |
| `anthropic-workspace-id` | e.g. `wrkspc_...` | Only for multi-workspace API keys |

- **`anthropic-version` is required, and the documented value is `2023-06-01`.**
  - Versioning page: "When making API requests, you must send an `anthropic-version` request header.
    For example, `anthropic-version: 2023-06-01`."
    — <https://platform.claude.com/docs/en/api/versioning>.
  - Only two versions exist in the history: `2023-06-01` (current) and `2023-01-01` (initial).

### Extra header for browser use
- **`anthropic-dangerous-direct-browser-access: true`**
  - It is what the official TypeScript SDK sends when browser mode is enabled:
    ```ts
    ...(this._options.dangerouslyAllowBrowser
      ? { 'anthropic-dangerous-direct-browser-access': 'true' }
      : undefined),
    'anthropic-version': '2023-06-01',
    ```
    — <https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/client.ts>.
  - It appears in the API's allowed CORS request headers (observed):
    `access-control-allow-headers: x-api-key,anthropic-version,content-type,anthropic-dangerous-direct-browser-access`.
  - Note: this exact header name does **not** appear in Anthropic's rendered docs prose; I searched
    the fetched full-docs text and found only the `dangerouslyAllowBrowser` SDK option and the CORS
    changelog entry. The authoritative sources for the header are the official SDK source and the
    live CORS response above.

### CORS / client-side warnings
- Anthropic explicitly supports browser use via CORS, with one documented carve-out:
  - "We've added support for usage of the SDK in browsers by returning CORS headers in the API
    responses. Set `dangerouslyAllowBrowser: true` in the SDK instantiation to enable this feature."
    — <https://platform.claude.com/docs/en/release-notes/overview> (release notes, Aug 22 2024).
  - "**Cross-Origin Resource Sharing (CORS):** CORS is not supported for organizations with ZDR
    arrangements. To make API calls from browser-based applications, route requests through a
    backend proxy server."
    — <https://platform.claude.com/docs/en/manage-claude/api-and-data-retention> (Zero data
    retention → "What ZDR does not cover").
- **Observed CORS (live, 2026-09-19):**
  - `OPTIONS https://api.anthropic.com/v1/messages` with `Origin: https://example.com` →
    `HTTP/2 200`, `access-control-allow-origin: *`,
    `access-control-allow-methods: DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT`,
    `access-control-allow-headers: x-api-key,anthropic-version,content-type,anthropic-dangerous-direct-browser-access`,
    `access-control-max-age: 600`, `access-control-allow-credentials: true`.
  - A real `POST` returned `401` **with** `access-control-allow-origin: *`, so error bodies are
    readable from the browser.

### Official SDK in browser
- Official `@anthropic-ai/sdk`: "Web browsers: disabled by default to avoid exposing your secret API
  credentials ... Enable browser support by explicitly setting `dangerouslyAllowBrowser` to `true`."
  — <https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript> and
  <https://github.com/anthropics/anthropic-sdk-typescript/blob/main/README.md>.
- Raw `fetch` works, but then you must send `x-api-key`/`anthropic-version` and the browser-access
  header yourself.

### Request body shape
From <https://platform.claude.com/docs/en/api/messages>:

| Concern | Anthropic field |
|---|---|
| System prompt | **Top-level `system`** (not a message): "`system: optional string or array of TextBlockParam`". |
| Messages | `messages: array of MessageParam`, each `{role, content}`; roles are `user` / `assistant` (no `system` role). Consecutive same-role turns are merged. |
| Max output tokens | **`max_tokens` (required)**, number, min 0. "Set to `0` to populate the prompt cache without generating a response." |
| Temperature | `temperature` optional, `0.0`–`1.0`, default `1.0`. **Deprecated**: "Models released after Claude Opus 4.6 do not support setting temperature. A value of 1.0 will be accepted for backwards compatibility, all other values will be rejected with a 400 error." |
| Nucleus sampling | `top_p` optional, default `0.99`-style cutoff; **deprecated** for models after Opus 4.6 (values `<0.99` rejected). |
| Top-k | `top_k` optional; **deprecated** for models after Opus 4.6 (any value rejected). |
| Stop sequences | `stop_sequences: optional array of string`. On match, `stop_reason` is `"stop_sequence"`. |
| Streaming | `stream: optional boolean` (SSE). |
| Structured output | `output_config.format` (see below). |
| Others | `tools`, `tool_choice`, `thinking`, `metadata`, `service_tier`. |

Example (illustrative):
```json
{
  "model": "claude-opus-5",
  "max_tokens": 256,
  "system": "You are terse.",
  "messages": [{ "role": "user", "content": "Hi" }]
}
```

### Streaming format and delta path
- SSE with **named events** plus a matching `type` inside the JSON. Sequence: `message_start` →
  (`content_block_start` → `content_block_delta`* → `content_block_stop`)* → `message_delta`* →
  `message_stop`, with occasional `ping` and possible `error` events
  — <https://platform.claude.com/docs/en/build-with-claude/streaming>.
- **Streamed text path: `event.delta.text` when `event.type === "content_block_delta"` and
  `event.delta.type === "text_delta"`.**
  - Raw wire example:
    `event: content_block_delta`
    `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ello frien"}}`
    — <https://platform.claude.com/docs/en/build-with-claude/streaming> (Content block delta types → Text delta).
- Tool-call JSON arrives as `input_json_delta` with partial `delta.partial_json` (accumulate, parse
  on `content_block_stop`).
- Thinking arrives as `thinking_delta` with `delta.thinking`.
- **No `data: [DONE]` terminator** ("Removed unnecessary `data: [DONE]` event" in the `2023-06-01`
  version history — <https://platform.claude.com/docs/en/api/versioning>). The stream ends after
  `message_stop`.

### Structured JSON output
- JSON outputs: `output_config: { "format": { "type": "json_schema", "schema": { ... } } }`.
  The valid JSON is "returned in the response's text content block".
- Strict tool use: `strict: true` on a tool definition.
- (Older beta is `output_format` with header `structured-outputs-2025-11-13`; now superseded.)
  — <https://platform.claude.com/docs/en/build-with-claude/structured-outputs>.

### Model ID conventions / examples
Slugs like `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`, `claude-haiku-4-5-20251001`,
`claude-fable-5-1`, `claude-mythos-5`
— <https://platform.claude.com/docs/en/about-claude/models/overview>.

---

## 3. Google Gemini (`generativelanguage.googleapis.com`)

Gemini exposes **three** callable surfaces. For a browser multi-provider tool the OpenAI-compatible
one is the least work; the native one is the most complete.

| Surface | Method + path | Base URL |
|---|---|---|
| Native generateContent | `POST /v1beta/models/{model}:generateContent` | `https://generativelanguage.googleapis.com` |
| Native streaming | `POST /v1beta/models/{model}:streamGenerateContent?alt=sse` | same |
| OpenAI compatibility | `POST /v1beta/openai/chat/completions` | same |
| Interactions API (new, GA) | `POST /v1beta/interactions` (append `?alt=sse` to stream) | same |

Sources:
- Native path/params: <https://ai.google.dev/api/generate-content> and the live Discovery document
  <https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta>
  (`models.generateContent` path `v1beta/{+model}:generateContent`).
- OpenAI compat: <https://ai.google.dev/gemini-api/docs/openai>.
- Interactions: <https://ai.google.dev/gemini-api/docs/interactions-overview>.
- **Status:** "As of June 2026, [Interactions API] is Generally Available and recommended for all new
  projects. While it is now considered legacy, the original `generateContent` API remains fully
  supported." — <https://ai.google.dev/gemini-api/docs/interactions-overview>.

### Auth (both `?key=` and header are documented)
- Native: `x-goog-api-key: <KEY>` header **or** `?key=<KEY>` query parameter.
  - Header form: `curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent" -H "x-goog-api-key: $GEMINI_API_KEY" ...`
    — <https://ai.google.dev/gemini-api/docs/generate-content/text-generation>.
  - Query form: `curl ".../v1beta/models/gemini-2.0-flash:generateContent?key=$GEMINI_API_KEY" ...`
    — <https://ai.google.dev/api/generate-content>.
  - So: **Gemini does not require `?key=`; the `x-goog-api-key` header is equally valid.** The live
    CORS preflight allowed `x-goog-api-key,content-type`, which is what a header-based browser call
    needs.
- OpenAI-compat surface: `Authorization: Bearer $GEMINI_API_KEY`
  — <https://ai.google.dev/gemini-api/docs/openai>.
- Interactions surface REST examples use `x-goog-api-key`
  — <https://ai.google.dev/gemini-api/docs/api-key>.

### Extra headers for browser use
- None provider-specific. CORS already allows `x-goog-api-key`.
- Do not put the key in a URL query if you can avoid it (it leaks via logs/referrers), even though
  `?key=` is documented.

### CORS / client-side warnings
- Docs do not contain a positive "CORS supported" sentence. They warn:
  "**Never expose keys client-side in production:** Do not hardcode API keys directly in web or
  mobile apps. Keys compiled in client-side code can be extracted by users. To secure client-side
  apps, run a backend proxy server to make the actual API calls."
  — <https://ai.google.dev/gemini-api/docs/api-key>.
- **Observed CORS (live, 2026-09-19):**
  - `OPTIONS .../v1beta/models/gemini-2.0-flash:generateContent` with `Origin: https://example.com`
    → `HTTP/2 200`, `access-control-allow-origin: https://example.com` (origin echoed),
    `access-control-allow-methods: DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT`,
    `access-control-allow-headers: x-goog-api-key,content-type`, `access-control-max-age: 3600`.
  - A real `POST` returned `400` **with** `access-control-allow-origin: https://example.com`, so
    error bodies are readable.
- Note: the older OpenAI-compat docs pages still point at `httpOptions`-style proxies; the
  compatibility endpoint itself is on the same CORS-enabled host.

### Official SDK in browser
- Official `@google/genai` supports browsers. The README says: "**Browser** ... In the browser the
  initialization code is identical: `const ai = new GoogleGenAI({apiKey: 'GEMINI_API_KEY'});`", with
  a caution: "**API Key Security:** Avoid exposing API keys in client-side code. Use server-side
  implementations in production environments."
  — <https://github.com/googleapis/js-genai/blob/main/README.md>.
- Raw `fetch` also works (see native CORS above).

### Request body shape — native `generateContent`
From the Discovery schema (`GenerateContentRequest`, `Content`, `Part`, `GenerationConfig`) and
<https://ai.google.dev/api/generate-content>:

| Concern | Gemini field (JSON) |
|---|---|
| Top-level request | `contents` (required), `systemInstruction`, `generationConfig`, `tools`, `toolConfig`, `safetySettings`, `cachedContent` |
| Conversation turns | `contents: [{ "role": "user" \| "model", "parts": [{ "text": "..." }] }]` |
| System prompt | **`systemInstruction`** (top-level `Content` object), e.g. `{ "parts": [{ "text": "..." }] }`. "Currently, text only." |
| Max output tokens | `generationConfig.maxOutputTokens` (int) |
| Temperature | `generationConfig.temperature`, range `[0.0, 2.0]` |
| Nucleus sampling | `generationConfig.topP` (number); `generationConfig.topK` (int) |
| Stop sequences | `generationConfig.stopSequences` — "set of character sequences (up to 5)" |
| Others | `candidateCount`, `seed`, `presencePenalty`, `frequencyPenalty`, `thinkingConfig`, `responseModalities` |
| Structured output | `generationConfig.responseMimeType` (`"application/json"`) **+** `generationConfig.responseSchema` (OpenAPI-subset schema). `responseSchema` is marked **deprecated** in the Discovery doc: "Use `response_format` instead." `responseJsonSchema` is the newer name. |

Example (illustrative):
```json
{
  "systemInstruction": { "parts": [{ "text": "You are terse." }] },
  "contents": [{ "role": "user", "parts": [{ "text": "Hi" }] }],
  "generationConfig": { "maxOutputTokens": 256, "temperature": 0.7 }
}
```

### Request body shape — Interactions API
Top-level fields: `model`, `input` (string or array), `system_instruction`, `generation_config`
(`temperature`, `thinking_level`/`thinking_budget`, …), `tools`, `store` (default `true`),
`previous_interaction_id`, `background`, `response_format`
— <https://ai.google.dev/gemini-api/docs/interactions-overview> and
<https://ai.google.dev/gemini-api/docs/streaming>.

- Structured output on Interactions: top-level `response_format`, e.g.
  `"response_format": { "type": "text", "mime_type": "application/json", "schema": { ... } }`
  — <https://ai.google.dev/gemini-api/docs/generate-content/structured-output> and
  <https://ai.google.dev/gemini-api/docs/migrate-to-interactions>.

### Streaming format and delta path
- **Native `generateContent`:** `POST ...:streamGenerateContent?alt=sse` with a key header/param.
  Each SSE `data:` payload is a `GenerateContentResponse` object.
  - **Text path: `candidates[0].content.parts[0].text`**
    — the JS/Apps Script examples parse exactly `data['candidates'][0]['content']['parts'][0]['text']`
    — <https://ai.google.dev/gemini-api/docs/generate-content/text-generation>.
  - Terminator: Google's docs for `generateContent` do not show a `[DONE]` frame (only the
    Interactions streaming doc does). Treat end-of-stream as the connection closing.
- **Interactions API:** `POST /v1beta/interactions` with `"stream": true` (REST adds `?alt=sse`).
  - Named SSE events: `interaction.created`, `interaction.status_update`, `step.start`,
    `step.delta`, `step.stop`, `interaction.completed`, `done`/`error`
    — <https://ai.google.dev/gemini-api/docs/streaming>.
  - **Streamed text path: `data.delta.text` when `event_type === "step.delta"` and
    `delta.type === "text"`.**
    Example: `data: {"index":1,"delta":{"text":"1, 2, 3, ","type":"text"},"event_type":"step.delta"}`
    — <https://ai.google.dev/gemini-api/docs/streaming>.
  - Terminator: `event: done` / `data: [DONE]`.

### OpenAI-compat surface specifics
- Base: `https://generativelanguage.googleapis.com/v1beta/openai/`; call `chat/completions`.
- Auth: `Authorization: Bearer $GEMINI_API_KEY`.
- System prompt: ordinary `messages[0]` with `role: "system"` (the docs' own examples put a system
  message first).
- `stream: true` works; **delta path `chunk.choices[0].delta.content`** (standard OpenAI shape).
- Structured output: `response_format` (the docs use OpenAI's `zodResponseFormat(...)` /
  `client.beta.chat.completions.parse`).
- `reasoning_effort` is mapped to Gemini `thinking_level` / `thinking_budget`; Gemini-only fields go
  in `extra_body`.
  — all from <https://ai.google.dev/gemini-api/docs/openai>.

### Model ID conventions / examples
`gemini-3.8-flash`, `gemini-3.5-flash`, `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-3.1-pro-preview`
— <https://ai.google.dev/gemini-api/docs/models>.

---

## 4. OpenRouter (`openrouter.ai`)

### Base URL and endpoint
- `POST https://openrouter.ai/api/v1/chat/completions`
  — <https://openrouter.ai/docs/quickstart> and
  <https://openrouter.ai/docs/api_reference/overview>.
- Also exposes OpenAI-style `/api/v1/responses` and an Anthropic-style `/api/v1/messages`
  — <https://openrouter.ai/docs/api_reference/streaming> (section "Usage shape is specific to Chat
  Completions ... the Responses API (`/api/v1/responses`) ... the Messages API (`/api/v1/messages`)").

### Auth
- `Authorization: Bearer <OPENROUTER_API_KEY>`
  — <https://openrouter.ai/docs/quickstart>.
- The CORS allow-list also includes `X-Api-Key` (observed), but the docs use Bearer.

### Extra headers for browser use (optional attribution)
- `HTTP-Referer: <YOUR_SITE_URL>` — "optional. Site URL for rankings on openrouter.ai."
- `X-OpenRouter-Title: <YOUR_SITE_NAME>` — sets/modifies your app's title in rankings.
  "`X-Title` also accepted" (backwards compatibility).
- `X-OpenRouter-Categories` — marketplace categories.
- "In the examples below, the OpenRouter-specific headers are optional. Setting them allows your app
  to appear on the OpenRouter leaderboards."
  — <https://openrouter.ai/docs/quickstart> and <https://openrouter.ai/docs/api_reference/overview>
  (Headers section); exact wording in
  <https://openrouter.ai/docs/app-attribution>: "`HTTP-Referer` is **required for app attribution**"
  and "`X-OpenRouter-Title` ... `X-Title` is still supported for backwards compatibility."
- Practical browser note: sending `HTTP-Referer` from `fetch` is allowed but browsers may restrict
  setting it; `X-OpenRouter-Title` is the easier header to set. Attribution is not needed for the
  call to work.

### CORS / client-side warnings
- Docs do not say "CORS is supported" in prose. The closest statements:
  - The error-code table lists `400` as "Bad Request (invalid or missing params, CORS)"
    — <https://openrouter.ai/docs/api_reference/overview>.
  - For user-key flows the docs actively support keeping a key in the browser: "Store the API key
    securely within the user's browser or in your own database, and use it to make OpenRouter
    requests" (OAuth PKCE flow) — <https://openrouter.ai/docs/guides/overview/auth/oauth>.
  - But warn on unlimited keys: "If you need a key without a limit, keep it out of client-side code
    and rotate it promptly if you suspect it has been exposed."
    — <https://openrouter.ai/docs/api_reference/overview> (Using an API key).
- **Observed CORS (live, 2026-09-19):**
  - `OPTIONS https://openrouter.ai/api/v1/chat/completions` with `Origin: https://example.com` →
    `HTTP/2 204`, `access-control-allow-origin: *`,
    `access-control-allow-methods: GET,OPTIONS,PATCH,DELETE,POST,PUT`,
    and an allow-headers list that includes `Authorization`, `Content-Type`, `HTTP-Referer`,
    `X-Openrouter-Title`, `X-Title`, `X-Openrouter-Categories`, `X-Openrouter-App-Visibility`,
    `X-Stainless-*`.
  - A real `POST` returned `401` **with** `access-control-allow-origin: *`, so error bodies are
    readable.

### Official SDK in browser
- Official `@openrouter/sdk` supports "Evergreen browsers which include: Chrome, Safari, Edge,
  Firefox" plus Node/Bun/Deno
  — <https://github.com/OpenRouterTeam/typescript-sdk/blob/main/RUNTIMES.md>.
- Alternatively, point the official `openai` SDK at `baseURL: "https://openrouter.ai/api/v1"` with
  `defaultHeaders` for the attribution headers
  — <https://openrouter.ai/docs/quickstart> ("Using the OpenAI SDK").

### Request body shape
OpenRouter is **OpenAI-shaped** ("OpenRouter's request and response schemas are very similar to the
OpenAI Chat API ... OpenRouter normalizes the schema across models and providers")
— <https://openrouter.ai/docs/api_reference/overview>. Parameters from
<https://openrouter.ai/docs/api_reference/parameters>:

| Concern | OpenRouter field |
|---|---|
| System prompt | `messages[0]` with `role: "system"` (OpenAI-style). |
| Max output tokens | `max_tokens` (int, 1+). `max_completion_tokens` also accepted with the same semantics. |
| Temperature | `temperature`, float `0.0`–`2.0`, default `1.0`. |
| Nucleus sampling | `top_p` `0.0`–`1.0`; also `top_k`, `min_p`, `top_a`, `repetition_penalty`. |
| Stop sequences | `stop` (array). |
| Penalties/seed | `frequency_penalty` (−2..2), `presence_penalty` (−2..2), `seed`. |
| Routing | `models` (fallback list), `provider`, `route`, `plugins`. |
| Structured output | `response_format` (see below). |

Note: "When a sampling parameter is absent from your request, OpenRouter omits it upstream rather
than substituting a hardcoded value" — so omitting `temperature` differs from sending `1.0`.

### Streaming format and delta path
- `stream: true`; SSE. **Text path: `choices[0].delta.content`**
  — <https://openrouter.ai/docs/api_reference/streaming>.
- **Terminator: `data: [DONE]`.**
- OpenRouter-specific deviation: the usage chunk before `[DONE]` "contains one choice with a
  content-free `delta` that repeats the `finish_reason` (and `native_finish_reason`)", unlike OpenAI
  which sends an empty `choices` array. Example:
  ```
  data: {"id":"gen-abc123",...,"choices":[{"index":0,"delta":{"content":"","role":"assistant"},"finish_reason":"stop","native_finish_reason":"stop"}]}
  data: {"id":"gen-abc123",...,"choices":[{"index":0,"delta":{"content":"","role":"assistant"},"finish_reason":"stop","native_finish_reason":"stop"}],"usage":{...}}
  data: [DONE]
  ```
  — <https://openrouter.ai/docs/api_reference/streaming>.
- Provider errors can arrive as a chunk with `choices[0].finish_reason: "error"`.

### Structured JSON output
- `response_format` with `type: "json_schema"` and a `json_schema: { name, strict, schema }` object —
  a passthrough that maps to the upstream provider's structured-output mode.
  Full example in <https://openrouter.ai/docs/guides/features/structured-outputs>.
- Support is per-endpoint, not just per-model ("only some of those providers may support structured
  outputs"). To force it, set `require_parameters: true` in provider preferences.
- `{ "type": "json_object" }` is also supported ("older JSON mode"). A `response-healing` plugin can
  repair JSON — <https://openrouter.ai/docs/api_reference/overview> (Plugins).

### Model ID conventions / examples
`author/slug`, with optional routing aliases and variants:
`openai/gpt-5.2`, `anthropic/claude-opus-5`, `anthropic/claude-sonnet-4.5`, `openrouter/free`,
and "latest" aliases prefixed with `~` such as `~openai/gpt-sol-latest`,
`~anthropic/claude-sonnet-latest`
— <https://openrouter.ai/docs/quickstart> and <https://openrouter.ai/llms.txt>.

---

## 5. Ollama Cloud (`ollama.com`, hosted)

This is the hosted service, not `localhost:11434`. Ollama Cloud exposes **both** a native API and an
OpenAI-compatible API (and an Anthropic-compatible one).

### Base URLs
From the official base-URL table
(<https://docs.ollama.com/api/introduction>):

| API | Direct cloud access | Local server |
|---|---|---|
| Ollama (native) | `https://ollama.com/api` | `http://localhost:11434/api` |
| OpenAI compatibility | `https://ollama.com/v1` | `http://localhost:11434/v1` |
| Anthropic client base URL | `https://ollama.com` (client appends `/v1/messages`) | `http://localhost:11434` |

- **Yes, Ollama Cloud exposes an OpenAI-compatible `/v1/chat/completions`, under the hostname
  `ollama.com`** → full URL `https://ollama.com/v1/chat/completions`
  — <https://docs.ollama.com/api/openai-compatibility> (example uses
  `base_url="https://ollama.com/v1"`).
- Native chat: `POST https://ollama.com/api/chat`
  — <https://docs.ollama.com/api/chat>.
- Native generate: `POST https://ollama.com/api/generate`.
- Anthropic-compatible: `POST https://ollama.com/v1/messages`.

### Auth
- "Direct cloud inference at `https://ollama.com/api` and `https://ollama.com/v1` requires an API
  key." Use `Authorization: Bearer <OLLAMA_API_KEY>`. "This also applies to the hosted
  Anthropic-compatible `/v1/messages` endpoint; `x-api-key` alone is not supported."
  — <https://docs.ollama.com/api/authentication>.
- API keys never expire; revoke in Ollama settings.

### Extra headers for browser use
- None (and none can save it — see CORS).

### CORS / client-side warnings — direct browser use is not supported
- Docs explicitly warn:
  - "Keep your API key out of browser code and source control." — <https://docs.ollama.com/cloud>.
  - "Keep keys outside browser code and source control." — <https://docs.ollama.com/api/authentication>.
- **Observed (live, 2026-09-19): direct browser calls fail.**
  - `OPTIONS https://ollama.com/api/chat` with `Origin` + `Access-Control-Request-Method: POST` →
    `HTTP/2 405` `{"error":"Method Not Allowed"}`, **no CORS headers**.
  - `OPTIONS https://ollama.com/v1/chat/completions` → `HTTP/2 405`
    `{"error":{"message":"Method Not Allowed","type":"api_error",...}}`, no CORS headers.
  - `POST https://ollama.com/api/chat` and `POST https://ollama.com/v1/chat/completions` with
    `Origin` → `401`, **no `access-control-allow-origin`**.
  - A browser `fetch` to these endpoints sends `Authorization` and `Content-Type: application/json`,
    which forces a preflight; since preflight returns `405` with no allow-origin, the browser blocks
    the request. **Conclusion: stock browser `fetch` cannot call Ollama Cloud directly.** A proxy is
    required (or a same-origin server route).

### Official SDK in browser
- The official `ollama` npm package ships a browser build: "To use the library without node, import
  the browser module. `import ollama from 'ollama/browser'`."
  — <https://github.com/ollama/ollama-js/blob/main/README.md>.
- The same README shows pointing it at the hosted service:
  ```js
  const ollama = new Ollama({
    host: 'https://ollama.com',
    headers: { Authorization: 'Bearer ' + process.env.OLLAMA_API_KEY },
  })
  ```
  — <https://github.com/ollama/ollama-js/blob/main/README.md>.
- In practice, the browser build still hits the CORS wall above unless it is run in a
  non-browser-restricted environment (e.g. an Electron main process or a proxy). The SDK existing
  does not create CORS support on `ollama.com`.

### Native API shape
From the OpenAPI spec embedded in <https://docs.ollama.com/api/chat>:

| Concern | Native field |
|---|---|
| Endpoint | `POST /api/chat` (base `https://ollama.com/api`) |
| Request | `model` (required), `messages` (required), `stream` (default **`true`**), `format`, `options`, `think`, `tools`, `keep_alive` |
| Messages | `[{ "role": "user" \| "assistant" \| "system", "content": "..." }]`; images as base64 in `images` |
| System prompt | A message with `role: "system"` in `messages` (no separate top-level field) |
| Sampling / limits | **`options`** object: `options.temperature`, `options.top_p`, `options.top_k`, `options.min_p`, `options.seed`, `options.stop` (string or array), `options.num_ctx`, **`options.num_predict`** (max tokens) |
| Structured output | `format`: the string `"json"` **or** a full JSON Schema object |
| Streaming toggle | `stream: false` for a single JSON response |

Response (non-streaming): `message.content` is the text (`message.role` is always `"assistant"`);
also `message.thinking`, `message.tool_calls`, `done`, `done_reason`, `eval_count`, etc.
On `/api/generate` the text field is `response` instead.

### Streaming format and delta path
- Native endpoints stream by default in **newline-delimited JSON (`application/x-ndjson`)**, not SSE.
  - Each line is a JSON object; **text path: `message.content`** for `/api/chat`
    (`response` for `/api/generate`).
    Example line:
    `{"model":"gemma4","created_at":"2025-10-26T17:15:24.097767Z","message":{"role":"assistant","content":"That"},"done":false}`
    — <https://docs.ollama.com/api/streaming>.
  - The final object has `"done": true` and `done_reason`.
- The **OpenAI-compatible endpoint streams SSE** like OpenAI (`stream: true`) with
  `choices[0].delta.content`; "Streaming" is a supported feature of `/v1/chat/completions`
  — <https://docs.ollama.com/api/openai-compatibility> (Supported features list).

### Structured JSON output
- Native: `format: "json"` or a JSON Schema object in the request body
  — <https://docs.ollama.com/api/chat> and <https://docs.ollama.com/capabilities/structured-outputs>.
- OpenAI-compat: `response_format` is listed as a supported request field, and the docs say
  "Structured outputs work through the OpenAI-compatible API via `response_format`"
  — <https://docs.ollama.com/api/openai-compatibility> and
  <https://docs.ollama.com/capabilities/structured-outputs>.
- **Important limitation:** "**Ollama's Cloud currently does not support structured outputs.**"
  — <https://docs.ollama.com/capabilities/structured-outputs> (top-of-page note). So on
  `https://ollama.com` do not rely on `format`/`response_format` actually constraining the model.
- OpenAI-compat other limits on cloud: "The cloud API does not support stateful Responses, built-in
  web search through `/v1/responses`, or custom/freeform tool-call replay."
  — <https://docs.ollama.com/api/openai-compatibility>.

### Model ID conventions / examples
Cloud requests use the identifiers returned by `GET https://ollama.com/api/tags`, e.g.
`gemma4:31b`, `gpt-oss:120b`, `qwen3.5:397b`, `glm-5.2`, `deepseek-v4.1-flash`, `kimi-k3`.
"Cloud models do not need to be downloaded." Through the local app/CLI the same models are written
with a `:cloud` suffix (e.g. `gemma4:cloud`).
— <https://docs.ollama.com/cloud> and the live `https://ollama.com/api/tags`.

---

## Comparison tables

### A. Connection and auth

| | OpenAI | Anthropic | Gemini (native) | Gemini (OpenAI-compat) | OpenRouter | Ollama Cloud (native) | Ollama Cloud (OpenAI-compat) |
|---|---|---|---|---|---|---|---|
| Base URL | `https://api.openai.com/v1` | `https://api.anthropic.com` | `https://generativelanguage.googleapis.com` | `https://generativelanguage.googleapis.com/v1beta/openai` | `https://openrouter.ai/api` | `https://ollama.com/api` | `https://ollama.com/v1` |
| Chat endpoint | `POST /chat/completions` | `POST /v1/messages` | `POST /v1beta/models/{model}:generateContent` | `POST /chat/completions` | `POST /v1/chat/completions` | `POST /chat` | `POST /chat/completions` |
| Auth header | `Authorization: Bearer` | `x-api-key` (or Bearer) | `x-goog-api-key` or `?key=` | `Authorization: Bearer` | `Authorization: Bearer` | `Authorization: Bearer` | `Authorization: Bearer` |
| Required version header | — | `anthropic-version: 2023-06-01` | — | — | — | — | — |
| Browser-enabling header | — | `anthropic-dangerous-direct-browser-access: true` | — | — | — | — | — |
| Optional app header | `OpenAI-Organization`, `OpenAI-Project` | `anthropic-workspace-id` | — | — | `HTTP-Referer`, `X-OpenRouter-Title` (`X-Title`) | — | — |
| CORS from browser (observed) | Yes | Yes | Yes | Yes | Yes | **No (405 preflight)** | **No (405 preflight)** |

### B. Request body field names

| Concern | OpenAI chat | Anthropic | Gemini native | OpenRouter | Ollama native | Ollama OpenAI-compat |
|---|---|---|---|---|---|---|
| System prompt | `messages[] role:"system"` (or `"developer"`) | top-level `system` | top-level `systemInstruction` | `messages[] role:"system"` | `messages[] role:"system"` | `messages[] role:"system"` |
| Max tokens | `max_completion_tokens` (`max_tokens` deprecated) | `max_tokens` (**required**) | `generationConfig.maxOutputTokens` | `max_tokens` / `max_completion_tokens` | `options.num_predict` | `max_tokens` |
| Temperature | `temperature` 0–2 | `temperature` 0–1 (deprecated after Opus 4.6) | `generationConfig.temperature` 0–2 | `temperature` 0–2 | `options.temperature` | `temperature` |
| Top-p | `top_p` 0–1 | `top_p` (deprecated after Opus 4.6) | `generationConfig.topP` | `top_p` | `options.top_p` | `top_p` |
| Stop | `stop` (string or ≤4 array) | `stop_sequences` | `generationConfig.stopSequences` (≤5) | `stop` | `options.stop` | `stop` |
| Stream toggle | `stream` | `stream` | use `:streamGenerateContent` | `stream` | `stream` (default true) | `stream` |
| Structured output | `response_format` | `output_config.format` | `generationConfig.responseMimeType` + `responseSchema` | `response_format` | `format` | `response_format` |

### C. Streaming

| | Wire format | Text delta path | End marker |
|---|---|---|---|
| OpenAI chat | SSE, `data: {...}` chunks | `choices[0].delta.content` | `data: [DONE]` |
| Anthropic | SSE with named events | `event.delta.text` (`type=="content_block_delta"`, `delta.type=="text_delta"`) | `event: message_stop` (no `[DONE]`) |
| Gemini native | SSE (`?alt=sse`) | `candidates[0].content.parts[0].text` | connection close (docs do not show `[DONE]`) |
| Gemini Interactions | SSE with named events (`?alt=sse`) | `delta.text` (`event_type=="step.delta"`, `delta.type=="text"`) | `event: done` / `data: [DONE]` |
| Gemini OpenAI-compat | SSE | `choices[0].delta.content` | `data: [DONE]` |
| OpenRouter | SSE | `choices[0].delta.content` | `data: [DONE]` |
| Ollama native | **NDJSON** (`application/x-ndjson`) | `message.content` (chat) / `response` (generate) | final line with `"done": true` |
| Ollama OpenAI-compat | SSE | `choices[0].delta.content` | `data: [DONE]` |

### D. Official JS/TS SDK browser support

| Provider | Package | Browser support | How |
|---|---|---|---|
| OpenAI | `openai` | Yes | `new OpenAI({ dangerouslyAllowBrowser: true })` |
| Anthropic | `@anthropic-ai/sdk` | Yes | `new Anthropic({ dangerouslyAllowBrowser: true })` (sends the browser-access header) |
| Gemini | `@google/genai` | Yes | init identical in browser; docs caution about keys |
| OpenRouter | `@openrouter/sdk` | Yes | evergreen browsers listed in `RUNTIMES.md`; or `openai` SDK with `baseURL` |
| Ollama | `ollama` | Browser build exists (`ollama/browser`) | but `ollama.com` blocks CORS preflight, so direct browser use fails without a proxy |

---

## Precise answers to the specific questions asked

1. **Anthropic `anthropic-version` header requirement and value.** Required. Value `2023-06-01`
   (the only current version). "When making API requests, you must send an `anthropic-version`
   request header. For example, `anthropic-version: 2023-06-01`."
   — <https://platform.claude.com/docs/en/api/versioning>.

2. **Gemini `?key=` vs header.** Both are officially documented and valid. The REST reference and
   the `generateContent` guide use the `x-goog-api-key: $GEMINI_API_KEY` header; the
   generate-content reference page also shows `...:generateContent?key=$GEMINI_API_KEY`. The API-key
   guide shows `x-goog-api-key` for the Interactions API. Gemini does **not** require the query
   parameter.
   — <https://ai.google.dev/gemini-api/docs/generate-content/text-generation>,
   <https://ai.google.dev/api/generate-content>,
   <https://ai.google.dev/gemini-api/docs/api-key>.

3. **Anthropic `anthropic-dangerous-direct-browser-access: true`.** Yes, this exact header exists
   and is what the official SDK sends when `dangerouslyAllowBrowser` is `true`; the API's CORS
   allow-headers list includes it. It is not documented in prose on the docs site (searched the full
   docs text); cite the SDK source
   (<https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/client.ts>) and the
   observed preflight.

4. **OpenRouter attribution headers.** `HTTP-Referer` (required *for app attribution*, not for the
   request to succeed) and `X-OpenRouter-Title` (with legacy alias `X-Title`). Both optional for the
   API call itself.
   — <https://openrouter.ai/docs/app-attribution>,
   <https://openrouter.ai/docs/api_reference/overview>.

5. **Ollama Cloud OpenAI-compatible `/v1/chat/completions`.** Yes: `https://ollama.com/v1/chat/completions`
   with `Authorization: Bearer`. Native shape is `POST https://ollama.com/api/chat` with an
   `options` object and NDJSON streaming; structured outputs are not supported on Cloud.
   — <https://docs.ollama.com/api/introduction>,
   <https://docs.ollama.com/api/openai-compatibility>,
   <https://docs.ollama.com/api/chat>,
   <https://docs.ollama.com/capabilities/structured-outputs>.

---

## All source URLs

OpenAI
- <https://developers.openai.com/api/reference/overview.md> (API Overview: base, Bearer auth, client-side warning)
- <https://developers.openai.com/api/reference/chat-completions/overview.md>
- <https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events.md>
- <https://developers.openai.com/api/docs/guides/structured-outputs.md>
- <https://developers.openai.com/api/docs/guides/streaming-responses.md>
- <https://developers.openai.com/api/docs/guides/production-best-practices.md>
- <https://developers.openai.com/api/docs/models.md>
- <https://github.com/openai/openai-openapi/blob/master/openapi.yaml> (servers, security, schemas, `[DONE]`)
- <https://github.com/openai/openai-node/blob/master/README.md> (`dangerouslyAllowBrowser`)
- <https://github.com/openai/openai-node/blob/master/src/core/streaming.ts> (`data: [DONE]`)

Anthropic
- <https://platform.claude.com/docs/en/api/overview> (base URL, auth header table)
- <https://platform.claude.com/docs/en/api/versioning> (`anthropic-version: 2023-06-01`)
- <https://platform.claude.com/docs/en/api/messages> (endpoint, body fields)
- <https://platform.claude.com/docs/en/build-with-claude/streaming> (event types, `delta.text`)
- <https://platform.claude.com/docs/en/build-with-claude/structured-outputs> (`output_config.format`)
- <https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript> (`dangerouslyAllowBrowser`)
- <https://platform.claude.com/docs/en/manage-claude/api-and-data-retention> (CORS not supported under ZDR)
- <https://platform.claude.com/docs/en/about-claude/models/overview> (model IDs)
- <https://platform.claude.com/docs/en/release-notes/overview> (changelog: CORS headers added for browser SDK use)
- <https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/client.ts> (`anthropic-dangerous-direct-browser-access`)

Google Gemini
- <https://ai.google.dev/api/generate-content> (endpoint, `?key=`, request/response schemas, streaming)
- <https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta> (authoritative field names and ranges)
- <https://ai.google.dev/gemini-api/docs/generate-content/text-generation> (`x-goog-api-key`, `?alt=sse`, `candidates[0].content.parts[0].text`)
- <https://ai.google.dev/gemini-api/docs/generate-content/structured-output> (`responseMimeType`/`responseSchema`, `response_format`)
- <https://ai.google.dev/gemini-api/docs/openai> (OpenAI-compat base URL, Bearer, streaming, `response_format`)
- <https://ai.google.dev/gemini-api/docs/api-key> (`x-goog-api-key`, client-side warning)
- <https://ai.google.dev/gemini-api/docs/interactions-overview>
- <https://ai.google.dev/gemini-api/docs/streaming> (`step.delta` / `delta.text` / `[DONE]`)
- <https://ai.google.dev/gemini-api/docs/migrate-to-interactions>
- <https://ai.google.dev/gemini-api/docs/models>
- <https://github.com/googleapis/js-genai/blob/main/README.md> (browser init, key caution)

OpenRouter
- <https://openrouter.ai/docs/quickstart> (endpoint, Bearer, SDK, OpenAI SDK drop-in)
- <https://openrouter.ai/docs/api_reference/overview> (OpenAI-shaped schema, headers, `response_format`, error codes)
- <https://openrouter.ai/docs/api_reference/parameters> (sampling field names/ranges)
- <https://openrouter.ai/docs/api_reference/streaming> (`delta.content`, `[DONE]`, usage-chunk deviation)
- <https://openrouter.ai/docs/guides/features/structured-outputs> (`response_format` json_schema)
- <https://openrouter.ai/docs/app-attribution> (`HTTP-Referer`, `X-OpenRouter-Title`, `X-Title`)
- <https://openrouter.ai/docs/guides/overview/auth/oauth> (browser-stored keys)
- <https://openrouter.ai/llms.txt>
- <https://github.com/OpenRouterTeam/typescript-sdk/blob/main/RUNTIMES.md> (browser runtimes)

Ollama
- <https://docs.ollama.com/api/introduction> (base URL table)
- <https://docs.ollama.com/cloud> (cloud usage, key warning, models)
- <https://docs.ollama.com/api/authentication> (`Authorization: Bearer`, no `x-api-key`, key warning)
- <https://docs.ollama.com/api/openai-compatibility> (`https://ollama.com/v1`, supported fields, cloud limits)
- <https://docs.ollama.com/api/chat> (native request/response schema)
- <https://docs.ollama.com/api/streaming> (NDJSON)
- <https://docs.ollama.com/capabilities/structured-outputs> (Cloud does not support structured outputs)
- <https://ollama.com/api/tags> (live cloud model IDs)
- <https://github.com/ollama/ollama-js/blob/main/README.md> (`ollama/browser`, `host: https://ollama.com`)
