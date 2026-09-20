import type { Connection } from "./connection";
import type { ModelRequest } from "./modelRequest";
import { protocolFor } from "./protocols";
import type { Transport } from "./transport";

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
      return respond(request);
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
