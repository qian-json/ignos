// Written with AI assistance (Claude Code)
// A question asked away from the Ask page waits here until the Ask panel takes it. The Ask page is
// lazy, so on a cold load its panel mounts after the router has already landed there; the panel takes
// the question in its mount effect instead of waiting for an event it was not listening for yet.
import type { AskRequest } from "../AskBar";

let pending: AskRequest | null = null;

/** Keep a question for the Ask panel. A newer question replaces an older one. */
export function holdAsk(req: AskRequest): void {
  pending = req;
}

/** Whether a question is waiting for the Ask panel. */
export const hasPendingAsk = (): boolean => pending !== null;

/** The waiting question, handed over once: the next call returns null. */
export function takePendingAsk(): AskRequest | null {
  const req = pending;
  pending = null;
  return req;
}
