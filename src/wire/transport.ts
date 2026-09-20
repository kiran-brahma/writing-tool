import { describeError } from "../errors";
import { DEFAULT_CONCURRENCY, type Connection } from "./connection";
import type { ModelRequest } from "./modelRequest";
import { protocolFor, type BuiltRequest } from "./protocols";

/**
 * The single seam: the only module that performs a request. Everything above it
 * reasons about prose and hands down a ModelRequest; a fixture player can stand
 * in for the fetch Transport and record every request it receives, which is how
 * the privacy property is asserted rather than believed.
 */
export interface Transport {
  send(request: ModelRequest): Promise<string>;
  listModels(connection: Connection): Promise<string[]>;
}

export interface TransportOptions {
  /** Shared so the UI can render the visible queue for the same gate. */
  gate?: ConcurrencyGate;
  maxAttempts?: number;
  baseDelayMs?: number;
}

export const DEFAULT_MAX_ATTEMPTS = 4;
export const DEFAULT_BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 30_000;

/**
 * A response Obelus could not use: a non-2xx the browser could read, or a 2xx
 * whose body was not the JSON the Protocol expected.
 */
export class ProviderError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(connectionName: string, status: number, body: string) {
    // Story 55: the Provider's own words are surfaced verbatim.
    super(`The ${connectionName} Connection returned ${status}: ${body}`);
    this.name = "ProviderError";
    this.status = status;
    this.body = body;
  }
}

/**
 * A request that never produced a readable response: a dead base URL, a
 * blocked CORS preflight, or an auth failure whose body the browser refuses to
 * expose. It is reported as unreachable rather than guessed at.
 */
export class UnreachableError extends Error {
  constructor(connectionName: string, detail: string) {
    super(
      `Could not reach the ${connectionName} Connection: ${detail}. Check the base URL and key, ` +
        `then use "Test connection".`,
    );
    this.name = "UnreachableError";
  }
}

export function createFetchTransport(options: TransportOptions = {}): Transport {
  const gate = options.gate ?? new ConcurrencyGate();
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  async function requestJson(built: BuiltRequest, connection: Connection): Promise<unknown> {
    const response = await fetchWithRetry(built, connection, gate, maxAttempts, baseDelayMs);
    const text = await response.text();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      // A 2xx that is not JSON is not something a tolerant parser can save; the
      // raw body is surfaced so the Writer sees what actually arrived.
      throw new ProviderError(connection.name, response.status, text);
    }
  }

  return {
    async send(request): Promise<string> {
      const adapter = protocolFor(request.connection.protocol);
      const built = adapter.buildRequest(request);
      assertWithinConnection(request.connection, built.url);
      const body = await requestJson(built, request.connection);
      return adapter.parseResponse(body);
    },

    async listModels(connection): Promise<string[]> {
      const adapter = protocolFor(connection.protocol);
      const built = adapter.buildModelListRequest(connection);
      assertWithinConnection(connection, built.url);
      const body = await requestJson(built, connection);
      return adapter.parseModelList(body);
    },
  };
}

export interface ConnectionTest {
  ok: boolean;
  models: string[];
  error: string | null;
}

/**
 * Story 10: test a Connection immediately. It reuses "list models", which is a
 * free GET that proves the base URL answers and the key is accepted, so it
 * works on every Connection including the two whose chat adapters are not
 * implemented yet.
 */
export async function testConnection(
  transport: Transport,
  connection: Connection,
): Promise<ConnectionTest> {
  try {
    const models = await transport.listModels(connection);
    return { ok: true, models, error: null };
  } catch (error) {
    return { ok: false, models: [], error: describeError(error) };
  }
}

async function fetchWithRetry(
  built: BuiltRequest,
  connection: Connection,
  gate: ConcurrencyGate,
  maxAttempts: number,
  baseDelayMs: number,
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    attempt += 1;

    let response: Response;
    try {
      response = await gate.run(connection, () => fetch(built.url, built.init));
    } catch (error) {
      // `fetch` throwing means no readable response at all — the browser's
      // opaque network failure. There is no status to retry on.
      throw new UnreachableError(connection.name, describeError(error));
    }

    if (response.ok) return response;

    const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < maxAttempts) {
      await sleep(retryAfter ?? backoff(attempt, baseDelayMs));
      continue;
    }

    throw new ProviderError(connection.name, response.status, await readErrorBody(response));
  }
}

/** Seconds or an HTTP date, in milliseconds, or null when absent/unparseable. */
export function parseRetryAfter(header: string | null): number | null {
  if (header === null) return null;
  const trimmed = header.trim();
  if (trimmed === "") return null;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - Date.now());
}

function backoff(attempt: number, baseDelayMs: number): number {
  return Math.min(MAX_DELAY_MS, baseDelayMs * 2 ** (attempt - 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    // An unreadable error body is itself the fact to report.
    return `(the Provider's error could not be read: ${describeError(error)})`;
  }
}

/**
 * The privacy property, enforced structurally: a request URL must sit inside
 * the configured Connection's base URL. A Protocol adapter that tried to build
 * a URL against a different origin would fail here rather than send.
 */
export function assertWithinConnection(connection: Connection, url: string): void {
  const base = connection.baseUrl.replace(/\/+$/, "");
  if (url !== base && !url.startsWith(`${base}/`)) {
    throw new Error(
      `Refusing to send to a URL outside the configured Connection "${connection.name}" ` +
        `(${connection.baseUrl}).`,
    );
  }
}

export interface QueueView {
  active: number;
  queued: number;
}

type Waiter = () => void;

/**
 * Story 57: a per-Connection concurrency cap with a visible queue. The gate is
 * observable so the Writer can see how many requests are in flight and how many
 * are waiting, rather than watching a spinner and guessing.
 */
export class ConcurrencyGate {
  private readonly defaultLimit: number;
  private readonly active = new Map<string, number>();
  private readonly waiters = new Map<string, Waiter[]>();
  private readonly listeners = new Set<() => void>();

  constructor(defaultLimit: number = DEFAULT_CONCURRENCY) {
    this.defaultLimit = defaultLimit;
  }

  limitFor(connection: Connection): number {
    const configured = connection.concurrency;
    return Number.isFinite(configured) && configured >= 1
      ? Math.floor(configured)
      : this.defaultLimit;
  }

  async run<T>(connection: Connection, task: () => Promise<T>): Promise<T> {
    await this.acquire(connection);
    try {
      return await task();
    } finally {
      this.release(connection.id);
    }
  }

  view(connectionId: string): QueueView {
    return {
      active: this.active.get(connectionId) ?? 0,
      queued: this.waiters.get(connectionId)?.length ?? 0,
    };
  }

  /** The total across every Connection, for a single queue indicator. */
  total(): QueueView {
    const ids = new Set([...this.active.keys(), ...this.waiters.keys()]);
    let active = 0;
    let queued = 0;
    for (const id of ids) {
      const state = this.view(id);
      active += state.active;
      queued += state.queued;
    }
    return { active, queued };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private acquire(connection: Connection): Promise<void> {
    const id = connection.id;
    const active = this.active.get(id) ?? 0;
    if (active < this.limitFor(connection)) {
      this.active.set(id, active + 1);
      this.emit();
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const waiters = this.waiters.get(id) ?? [];
      waiters.push(() => {
        this.active.set(id, (this.active.get(id) ?? 0) + 1);
        this.emit();
        resolve();
      });
      this.waiters.set(id, waiters);
      this.emit();
    });
  }

  private release(id: string): void {
    const active = (this.active.get(id) ?? 1) - 1;
    if (active <= 0) this.active.delete(id);
    else this.active.set(id, active);

    const waiters = this.waiters.get(id);
    const next = waiters?.shift();
    if (waiters !== undefined && waiters.length === 0) this.waiters.delete(id);

    if (next !== undefined) next();
    else this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
