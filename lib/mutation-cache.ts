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

export const MUTATION_BUDGET_MS = 4500;
type MutationOptions<T> = {
  key: string;
  optimistic: boolean;
  serialize?: boolean;
  load: () => Promise<string | null>;
  attempt: (
    original: string | null,
    conflict: (current: string | null) => void,
  ) => Promise<T | undefined>;
  busyMessage: string;
  // Retry budget, checked between attempts after a rejected CAS. Individual
  // storage calls have their own deadlines; queue time is measured separately.
  budgetMs?: number;
};
// Concurrent guesses in a warm instance must not all fight over the same room
// snapshot. Other rooms run independently; Redis CAS still guards other instances.
const queues = new Map<string, Promise<void>>();
export async function mutateGame<T>(options: MutationOptions<T>): Promise<T> {
  if (!options.serialize || process.env.RALLY_DISABLE_MUTATION_QUEUE === "true")
    return runMutation(options);
  const previous = queues.get(options.key);
  let release!: () => void;
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  queues.set(options.key, turn);
  try {
    if (previous) await measure("queue", () => previous);
    return await runMutation(options);
  } finally {
    release();
    if (queues.get(options.key) === turn) queues.delete(options.key);
  }
}
async function runMutation<T>(options: MutationOptions<T>): Promise<T> {
  const started = Date.now(),
    budget = options.budgetMs ?? MUTATION_BUDGET_MS;
  let conflict: { value: string | null } | undefined;
  for (let retry = 0; retry < 64; retry++) {
    if (retry > 0 && Date.now() - started > budget)
      throw new GameError(options.busyMessage, 503, "STORAGE_SLOW");
    const entry =
      retry === 0 &&
      options.optimistic &&
      process.env.RALLY_DISABLE_MUTATION_CACHE !== "true"
        ? snapshots.get(options.key)
        : undefined;
    const cached = entry && entry.expires > Date.now() ? entry : undefined;
    const original = conflict
      ? conflict.value
      : cached
        ? await measure("snapshot", async () => cached.value)
        : await measure("state", options.load);
    conflict = undefined;
    try {
      const result = await options.attempt(original, (value) => {
        conflict = { value };
      });
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
    if (!cached && !conflict)
      await new Promise((resolve) => setTimeout(resolve, randomInt(5, 25)));
  }
  throw new GameError(options.busyMessage, 409, "BUSY");
}
