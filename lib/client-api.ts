import type { PublicRoom } from "./types";

// Per attempt. Recover before a lost response turns into a long frozen board.
export const API_TIMEOUT_MS = 5000;
export const GUESS_PROBE_MS = 450;

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code?: string,
  ) {
    super(message);
  }
}

export const isGuessRejection = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.code === "INVALID_GUESS";

// Bound the entire response, including its body. A lost mutation reply does
// not imply that the server failed to save it; callers reconcile before retry.
export async function api<T>(
  url: string,
  data?: unknown,
  signal?: AbortSignal,
  timeoutMs = API_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const started = performance.now();
  let phase = "headers",
    status: number | undefined,
    server: string | null = null;
  let failed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new ApiError(
          "This request took too long. Please try again.",
          0,
          "REQUEST_TIMEOUT",
        ),
      );
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, {
          method: data ? "POST" : "GET",
          ...(data
            ? {
                body: JSON.stringify(data),
                headers: { "Content-Type": "application/json" },
              }
            : {}),
          cache: "no-store",
          ...(data ? { priority: "high" as RequestPriority } : {}),
          signal: signal
            ? AbortSignal.any([signal, controller.signal])
            : controller.signal,
        });
        status = response.status;
        server = response.headers.get("server-timing");
        phase = "body";
        const json = await response.json();
        phase = "complete";
        if (!response.ok)
          throw new ApiError(
            json?.error ?? "Something went wrong. Please try again.",
            response.status,
            json?.code,
          );
        return json as T;
      })(),
      deadline,
    ]);
  } catch (error) {
    failed =
      !signal?.aborted &&
      (!(error instanceof ApiError) || isRecoverable(error));
    if (signal?.aborted || error instanceof ApiError) throw error;
    throw new ApiError(
      "Could not reach the game. Check your connection and try again.",
      0,
      "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timer);
    if (!signal?.aborted && (failed || performance.now() - started >= 1500))
      console.warn("Wordrally request delay", {
        route: url.startsWith("/api/rooms/") ? "room" : url.split("?")[0],
        method: data ? "POST" : "GET",
        ms: Math.round(performance.now() - started),
        phase,
        status,
        server,
        visibility:
          typeof document === "undefined"
            ? undefined
            : document.visibilityState,
      });
  }
}

// A slow reply may already have been saved. Keep checking authoritative state
// while the POST is pending: the first read can race the commit. These reads
// never invent marks. At 900ms one identical submission may race a lost
// request even if the confirmation read also stalled. Callers must use an action
// protected against duplicates (guess/game IDs or a room-creation receipt).
export async function guessApi<T>(
  url: string,
  data: unknown,
  confirmed: (snapshot: T) => boolean,
  probeAfterMs = GUESS_PROBE_MS,
  probeUrl = url,
  timeoutMs = API_TIMEOUT_MS,
  onRetry?: () => void,
): Promise<T> {
  const controller = new AbortController();
  let backupStarted = false,
    originalError: unknown;
  let resolveBackup!: (value: T) => void,
    rejectBackup!: (error: unknown) => void;
  const backup = new Promise<T>((resolve, reject) => {
    resolveBackup = resolve;
    rejectBackup = reject;
  });
  const primary = api<T>(url, data, controller.signal, timeoutMs).catch(
    (error) => {
      originalError = error;
      if (!backupStarted) rejectBackup(error);
      throw error;
    },
  );
  const submissions = Promise.any([primary, backup]).catch(() => {
    throw originalError;
  });
  const retryTimer = setTimeout(() => {
    if (controller.signal.aborted) return;
    backupStarted = true;
    onRetry?.();
    api<T>(url, data, controller.signal, timeoutMs).then(
      resolveBackup,
      rejectBackup,
    );
  }, 900);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const recovery = new Promise<T>((resolve) => {
    const probe = async () => {
      try {
        const snapshot = await api<T>(
          probeUrl,
          undefined,
          controller.signal,
          1500,
        );
        if (confirmed(snapshot)) {
          resolve(snapshot);
          return;
        }
      } catch {
        /* The original submission remains authoritative. */
      }
      if (!controller.signal.aborted) timer = setTimeout(probe, 400);
    };
    timer = setTimeout(probe, probeAfterMs);
  });
  try {
    return await Promise.race([submissions, recovery]);
  } finally {
    clearTimeout(timer);
    clearTimeout(retryTimer);
    controller.abort();
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Transport failures and storage stalls, where the outcome is unknown or the
// server explicitly asked for a retry. Validation errors are never retried.
export const isRecoverable = (error: unknown): error is ApiError =>
  error instanceof ApiError &&
  (error.code === "REQUEST_TIMEOUT" ||
    error.code === "NETWORK_ERROR" ||
    error.code === "STORAGE_SLOW" ||
    error.code === "BUSY" ||
    error.status >= 500);

// Reads are side-effect free: one fresh attempt after a stall or lost reply.
export async function readApi<T>(
  url: string,
  signal?: AbortSignal,
  timeoutMs = API_TIMEOUT_MS,
): Promise<T> {
  try {
    return await api<T>(url, undefined, signal, timeoutMs);
  } catch (error) {
    if (signal?.aborted || !isRecoverable(error)) throw error;
    await pause(100);
    if (signal?.aborted) throw error;
    return api<T>(url, undefined, signal, timeoutMs);
  }
}

export type MutationOptions<T> = {
  // An authoritative read of the same state.
  confirmUrl: string;
  // Whether a snapshot shows that this exact mutation took effect.
  confirmed: (snapshot: T) => boolean;
  // Guesses also probe early while the original POST is still pending.
  probeAfterMs?: number;
  // Returned when the confirmation read says the caller is no longer a member
  // (403/404), e.g. after a leave that was saved but whose reply was lost.
  gone?: T;
  retryDelayMs?: number;
  timeoutMs?: number;
};

// A mutation whose reply was lost or slow may still have been saved. Check the
// authoritative state first; only if the action is not visible, send it once
// more. Every server action rejects a duplicate (guess word, round/match
// numbers, status checks) or is idempotent, so the single retry cannot apply
// twice, and a rejection of the retry is re-checked against fresh state.
export async function mutationApi<T>(
  url: string,
  data: unknown,
  options: MutationOptions<T>,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? API_TIMEOUT_MS;
  let retried = false;
  const confirm = async (): Promise<T | undefined> => {
    try {
      const snapshot = await api<T>(
        options.confirmUrl,
        undefined,
        undefined,
        Math.min(timeoutMs, 2000),
      );
      return options.confirmed(snapshot) ? snapshot : undefined;
    } catch (error) {
      if (
        options.gone !== undefined &&
        error instanceof ApiError &&
        (error.status === 403 || error.status === 404)
      )
        return options.gone;
      return undefined;
    }
  };
  try {
    return options.probeAfterMs === undefined
      ? await api<T>(url, data, undefined, timeoutMs)
      : await guessApi<T>(
          url,
          data,
          options.confirmed,
          options.probeAfterMs,
          options.confirmUrl,
          timeoutMs,
          () => {
            retried = true;
          },
        );
  } catch (error) {
    if (!isRecoverable(error)) throw error;
    const saved = await confirm();
    if (saved !== undefined) return saved;
    if (retried) throw error;
    await pause(options.retryDelayMs ?? 100 + Math.random() * 200);
    try {
      return await api<T>(url, data, undefined, timeoutMs);
    } catch (retryError) {
      // e.g. "already tried" / "already started": the first attempt landed.
      const landed = await confirm();
      if (landed !== undefined) return landed;
      throw retryError;
    }
  }
}

const mine = (room: PublicRoom) => room.players.find((p) => p.id === room.me);

// Whether `next` shows that `data` (sent from the `before` state) took effect.
export function roomActionConfirmed(
  before: PublicRoom | null,
  data: Record<string, unknown>,
  next: PublicRoom,
): boolean {
  const player = mine(next);
  switch (data.action) {
    case "join":
      return !!player?.active;
    case "leave":
      return !player || !player.active;
    case "team":
      return player?.team === data.team;
    case "configure": {
      const requested = (data.config ?? {}) as Record<string, unknown>;
      return (
        next.status === "lobby" &&
        Object.entries(requested).every(
          ([key, value]) =>
            (next.config as Record<string, unknown>)[key] === value,
        )
      );
    }
  }
  if (!before) return false;
  const sameMatch = (next.match ?? 0) === (before.match ?? 0);
  switch (data.action) {
    case "start":
      return before.status === "lobby" && next.status !== "lobby" && sameMatch;
    case "next":
      return next.matchId === before.matchId && next.round > before.round;
    case "nextMatch":
      return (next.match ?? 0) > (before.match ?? 0);
    case "replay":
      return (
        before.status === "finished" &&
        next.status === "lobby" &&
        (next.match ?? 0) === 0 &&
        next.revision > before.revision
      );
    case "guess": {
      if (next.matchId !== before.matchId) return false;
      if (before.config.mode === "race") {
        const index = Number(data.round),
          prior = before.race?.words[index]?.guesses.length ?? 0,
          words = next.race?.words[index]?.guesses ?? [];
        return words.length > prior && words.some((g) => g.word === data.word);
      }
      return (
        next.round === before.round &&
        (next.current?.guesses.length ?? 0) >
          (before.current?.guesses.length ?? 0) &&
        !!next.current?.guesses.some((g) => g.word === data.word)
      );
    }
  }
  return false;
}

// Room actions with lost-reply recovery; guesses keep the early probe.
export function roomMutation(
  code: string,
  before: PublicRoom | null,
  data: Record<string, unknown>,
): Promise<PublicRoom> {
  return mutationApi<PublicRoom>(`/api/rooms/${code}`, data, {
    confirmUrl: `/api/rooms/${code}?confirm=1`,
    confirmed: (next) => roomActionConfirmed(before, data, next),
    ...(data.action === "guess" ? { probeAfterMs: GUESS_PROBE_MS } : {}),
    ...(data.action === "leave" && before ? { gone: before } : {}),
  });
}
