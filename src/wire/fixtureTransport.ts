import type { Connection } from "./connection";
import type { ModelRequest, ModelUsage } from "./modelRequest";
import { protocolFor } from "./protocols";
import { CancelledError, type Transport } from "./transport";

/**
 * The test implementation of the Transport: it records every request it is
 * given and replays a fixture response. Tests read `requests` to assert the
 * privacy property — that the seam only ever saw the configured Connection's
 * own base URL — and to check header and body construction without a network.
 */

export interface RecordedRequest {
  connection: Connection;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface FixtureTransport extends Transport {
  readonly requests: RecordedRequest[];
}

export interface FixtureOptions {
  /** The text to return for a model call. Defaults to an empty string. */
  respond?: (request: ModelRequest) => string | Promise<string>;
  /** The model ids to return for a listing call. */
  models?: string[] | ((connection: Connection) => string[]);
  /**
   * Token usage to report for a model call, as a fixed value or a function of
   * the request. Tests need a Provider that reports usage and one that does not.
   */
  usage?: ModelUsage | ((request: ModelRequest) => ModelUsage | undefined);
}

export function createFixtureTransport(options: FixtureOptions = {}): FixtureTransport {
  const requests: RecordedRequest[] = [];
  const respond = options.respond ?? (() => "");

  return {
    requests,

    async send(request: ModelRequest): Promise<string> {
      const adapter = protocolFor(request.connection.protocol);
      const built = adapter.buildRequest(request);
      requests.push({
        connection: request.connection,
        url: built.url,
        method: built.init.method ?? "GET",
        headers: headerRecord(built.init.headers),
        body: parseBody(built.init.body),
      });
      // Honor the Run's signal the way `fetch` does, so a test can cancel a
      // fixture Run mid-flight and see the same cancellation a browser produces.
      const text = await raceWithSignal(Promise.resolve(respond(request)), request.signal);
      const usage =
        typeof options.usage === "function" ? options.usage(request) : options.usage;
      if (usage !== undefined) request.onUsage?.(usage);
      return text;
    },

    async listModels(connection: Connection): Promise<string[]> {
      const adapter = protocolFor(connection.protocol);
      const built = adapter.buildModelListRequest(connection);
      requests.push({
        connection,
        url: built.url,
        method: built.init.method ?? "GET",
        headers: headerRecord(built.init.headers),
        body: null,
      });
      if (typeof options.models === "function") return options.models(connection);
      return options.models ?? [];
    },
  };
}

function headerRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (headers === undefined) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

function parseBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") return null;
  return JSON.parse(body) as unknown;
}

/**
 * Reject with `CancelledError` as soon as `signal` aborts, even if the fixture
 * response never arrives. Without this a test transport that never resolves
 * would ignore the Writer's cancel, and the cancellation path would be untested.
 */
function raceWithSignal<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return promise;
  if (signal.aborted) return Promise.reject(new CancelledError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new CancelledError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
