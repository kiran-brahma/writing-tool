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
  /** How long one attempt may take, from sending to the last byte of the body. */
  requestTimeoutMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 30_000;
/**
 * #46: a Run holds the mutation lock while it waits on the Provider, so a
 * Provider that accepts the connection and then stalls would stop the whole
 * Library. The bound is generous, because a reasoning model on a long Document
 * is legitimately slow; it exists so a stall ends, not to hurry a slow answer.
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 5 * 60_000;

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

/**
 * A Run the Writer cancelled. Distinct from `UnreachableError` so a cancelled
 * Run is never misreported as a Connection that could not be reached.
 */
export class CancelledError extends Error {
  constructor() {
    super("The Run was cancelled.");
    this.name = "CancelledError";
  }
}

/**
 * #46: a request the Provider accepted but never finished answering. Distinct
 * from `CancelledError`, because the Writer did not stop it, and from
 * `UnreachableError`, because the base URL did answer.
 */
export class TimedOutError extends Error {
  constructor(connectionName: string, timeoutMs: number) {
    super(
      `The ${connectionName} Connection did not respond within ${describeDuration(timeoutMs)}. ` +
        `Try again, or check that the Provider is up.`,
    );
    this.name = "TimedOutError";
  }
}

function describeDuration(ms: number): string {
  if (ms >= 60_000) {
    const minutes = Math.round(ms / 60_000);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

/** True for the abort our own Transport raises, or a browser AbortError. */
export function isCancelledError(error: unknown): boolean {
  if (error instanceof CancelledError) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

export function createFetchTransport(options: TransportOptions = {}): Transport {
  const gate = options.gate ?? new ConcurrencyGate();
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

  async function requestJson(
    built: BuiltRequest,
    connection: Connection,
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    const { response, text } = await fetchWithRetry(
      built,
      connection,
      gate,
      { maxAttempts, baseDelayMs, requestTimeoutMs },
      signal,
    );
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
      const body = await requestJson(built, request.connection, request.signal);
      const usage = adapter.parseUsage(body);
      if (usage !== undefined) request.onUsage?.(usage);
      return adapter.parseResponse(body);
    },

    async listModels(connection): Promise<string[]> {
      const adapter = protocolFor(connection.protocol);
      const built = adapter.buildModelListRequest(connection);
      assertWithinConnection(connection, built.url);
      const body = await requestJson(built, connection, undefined);
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

interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  requestTimeoutMs: number;
}

/** A response and its whole body, read inside the attempt's deadline. */
interface Answer {
  response: Response;
  text: string;
}

async function fetchWithRetry(
  built: BuiltRequest,
  connection: Connection,
  gate: ConcurrencyGate,
  policy: RetryPolicy,
  signal: AbortSignal | undefined,
): Promise<Answer> {
  let attempt = 0;
  for (;;) {
    attempt += 1;
    if (signal?.aborted) throw new CancelledError();

    // The deadline starts inside the gate, so time spent queued behind other
    // requests to the same Connection is not charged to this one.
    const answer = await gate.run(connection, () =>
      attemptOnce(built, connection, policy.requestTimeoutMs, signal),
    );
    const { response } = answer;

    if (signal?.aborted) throw new CancelledError();
    if (response.ok) return answer;

    const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < policy.maxAttempts) {
      await sleepWithSignal(retryAfter ?? backoff(attempt, policy.baseDelayMs), signal);
      continue;
    }

    throw new ProviderError(connection.name, response.status, answer.text);
  }
}

/**
 * One request, bounded: the fetch and the body read share one deadline, so a
 * Provider that sends headers and then stalls mid-body is caught too. A timeout
 * is not retried, because each retry would hold the Run for another window.
 */
async function attemptOnce(
  built: BuiltRequest,
  connection: Connection,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<Answer> {
  const deadline = startDeadline(timeoutMs, signal);
  try {
    const response = await deadline.race(fetch(built.url, { ...built.init, signal: deadline.signal }));
    const text = response.ok
      ? await deadline.race(response.text())
      : await readErrorBody(response, deadline);
    return { response, text };
  } catch (error) {
    if (deadline.timedOut()) throw new TimedOutError(connection.name, timeoutMs);
    // An abort is a cancellation, not a Connection that could not be reached.
    if (signal?.aborted || isCancelledError(error)) throw new CancelledError();
    // `fetch` throwing means no readable response at all — the browser's
    // opaque network failure. There is no status to retry on.
    throw new UnreachableError(connection.name, describeError(error));
  } finally {
    deadline.clear();
  }
}

interface Deadline {
  /** Aborts when the caller's signal aborts or the time runs out. */
  signal: AbortSignal;
  timedOut(): boolean;
  /** Rejects as soon as `signal` aborts, even if `promise` ignores it. */
  race<T>(promise: Promise<T>): Promise<T>;
  clear(): void;
}

/**
 * The caller's signal combined with a timer. Built by hand rather than with
 * `AbortSignal.timeout`/`AbortSignal.any` so the timer is an ordinary
 * `setTimeout` that can be cleared the moment the attempt settles.
 */
function startDeadline(timeoutMs: number, callerSignal: AbortSignal | undefined): Deadline {
  const controller = new AbortController();
  let expired = false;
  const onCallerAbort = () => controller.abort();
  const timer = globalThis.setTimeout(() => {
    expired = true;
    controller.abort();
  }, timeoutMs);
  if (callerSignal?.aborted) controller.abort();
  else callerSignal?.addEventListener("abort", onCallerAbort, { once: true });

  return {
    signal: controller.signal,
    timedOut: () => expired,
    race<T>(promise: Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(new DOMException("The request was aborted.", "AbortError"));
        if (controller.signal.aborted) {
          onAbort();
          return;
        }
        controller.signal.addEventListener("abort", onAbort, { once: true });
        promise.then(
          (value) => {
            controller.signal.removeEventListener("abort", onAbort);
            resolve(value);
          },
          (error: unknown) => {
            controller.signal.removeEventListener("abort", onAbort);
            reject(error);
          },
        );
      });
    },
    clear() {
      globalThis.clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    },
  };
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

function sleepWithSignal(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CancelledError());
      return;
    }
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const onAbort = () => {
      if (timer !== undefined) globalThis.clearTimeout(timer);
      reject(new CancelledError());
    };
    timer = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function readErrorBody(response: Response, deadline: Deadline): Promise<string> {
  try {
    return await deadline.race(response.text());
  } catch (error) {
    // A timeout or a cancel is not an unreadable body; let the attempt report it.
    if (deadline.signal.aborted) throw error;
    // An unreadable error body is itself the fact to report.
    return `(the Provider's error could not be read: ${describeError(error)})`;
  }
}

/**
 * The privacy property, enforced structurally: a request URL must sit inside
 * the configured Connection's base URL. A Protocol adapter that tried to build
 * a URL against a different origin would fail here rather than send.
 *
 * Both URLs are parsed rather than compared as strings, so the check sees what
 * `fetch` will request: a dot segment that climbs above the base path, or
 * userinfo that changes the host, is resolved first and then refused.
 */
export function assertWithinConnection(connection: Connection, url: string): void {
  if (!isWithinBase(connection.baseUrl, url)) {
    throw new Error(
      `Refusing to send to a URL outside the configured Connection "${connection.name}" ` +
        `(${connection.baseUrl}).`,
    );
  }
}

/** Same scheme, host and port as the base, and a path at or under its path. */
function isWithinBase(baseUrl: string, url: string): boolean {
  let base: URL;
  let target: URL;
  try {
    base = new URL(baseUrl);
    target = new URL(url);
  } catch {
    // An unparseable URL is not provably inside the base, so it is refused.
    return false;
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") return false;
  if (target.origin !== base.origin) return false;
  const basePath = base.pathname.replace(/\/+$/, "");
  return target.pathname === basePath || target.pathname.startsWith(`${basePath}/`);
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
