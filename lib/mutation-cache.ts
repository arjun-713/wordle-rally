import { randomInt } from "node:crypto";
import { GameError } from "./engine";
import { measure } from "./timing";

// A private starting point for a guess, never an authoritative read. A cached
// result may only leave the server after its exact source passes the store CAS.
const snapshots = new Map<
  string,
  { value: string; expires: number; bytes: number }
>();
let bytes = 0;
const MAX_BYTES = 2 * 1024 * 1024,
  MAX_ENTRY_BYTES = 128 * 1024;
export function forgetMutation(key: string) {
  const entry = snapshots.get(key);
  if (entry) bytes -= entry.bytes;
  snapshots.delete(key);
}
export function rememberMutation(key: string, value: string) {
  if (
    !/^rally:(room|solo|daily):/.test(key) ||
    process.env.RALLY_DISABLE_MUTATION_CACHE === "true"
  )
    return;
  forgetMutation(key);
  const size = Buffer.byteLength(value);
  if (size > MAX_ENTRY_BYTES) return;
  const now = Date.now();
  for (const [key, entry] of snapshots)
    if (entry.expires <= now) forgetMutation(key);
  while (snapshots.size >= 256 || bytes + size > MAX_BYTES)
    forgetMutation(snapshots.keys().next().value!);
  snapshots.set(key, { value, bytes: size, expires: now + 30000 });
  bytes += size;
}

export const MUTATION_BUDGET_MS = 7000;
export async function mutateGame<T>(options: {
  key: string;
  optimistic: boolean;
  load: () => Promise<string | null>;
  attempt: (original: string | null) => Promise<T | undefined>;
  busyMessage: string;
  // Wall-clock budget for the whole transaction. It ends contention well
  // before the browser's per-request deadline so the client gets a retryable
  // answer instead of a timeout. Only checked between attempts, after a CAS
  // was rejected, so the action is known not to be saved.
  budgetMs?: number;
}): Promise<T> {
  const started = Date.now(),
    budget = options.budgetMs ?? MUTATION_BUDGET_MS;
  for (let retry = 0; retry < 12; retry++) {
    if (retry > 0 && Date.now() - started > budget)
      throw new GameError(options.busyMessage, 503, "STORAGE_SLOW");
    const entry =
      retry === 0 &&
      options.optimistic &&
      process.env.RALLY_DISABLE_MUTATION_CACHE !== "true"
        ? snapshots.get(options.key)
        : undefined;
    const cached = entry && entry.expires > Date.now() ? entry : undefined;
    const original = cached
      ? await measure("snapshot", async () => cached.value)
      : await measure("state", options.load);
    try {
      const result = await options.attempt(original);
      if (result !== undefined) return result;
    } catch (error) {
      // A different instance may have advanced/rematched/removed a player.
      // Recheck apparent validation failures against fresh state before rejecting.
      if (!cached || !(error instanceof GameError) || error.status >= 500)
        throw error;
    }
    forgetMutation(options.key);
    // A stale optimistic snapshot isn't a contended fresh transaction. Reload
    // immediately; retain bounded backoff for actual concurrent writers.
    if (!cached)
      await new Promise((resolve) => setTimeout(resolve, randomInt(5, 25)));
  }
  throw new GameError(options.busyMessage, 409, "BUSY");
}
