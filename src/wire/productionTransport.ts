import { ConcurrencyGate, createFetchTransport } from "./transport";

/**
 * The one Transport and the one concurrency gate the app uses. Sharing the gate
 * is what makes the visible queue truthful: test connection, list models and
 * any future model Pass all wait behind the same per-Connection cap.
 */
export const concurrencyGate = new ConcurrencyGate();
export const transport = createFetchTransport({ gate: concurrencyGate });
