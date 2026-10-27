import { rememberMutation, forgetMutation } from "./mutation-cache";
import { measure } from "./timing";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { GameError } from "./engine";
import { ReservationLimiter } from "./rate-reservations";
type Write = {
  key: string;
  expected: string | null;
  value: string;
  ttl?: number;
};
type RecordValue = { value: string; expires?: number };
const directory = path.join(
  process.cwd(),
  ".data",
  process.env.RALLY_DATA_NAMESPACE ?? "",
);
const file = path.join(directory, "state.json");
export function redisCredentials(
  env: Record<string, string | undefined> = process.env,
): { url: string; token: string } | null {
  for (const [urlKey, tokenKey] of [
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
  ]) {
    const url = env[urlKey],
      token = env[tokenKey];
    if (url && token) return { url, token };
  }
  return null;
}
export function storageMode(): "redis" | "local" {
  if (redisCredentials()) return "redis";
  if (
    process.env.VERCEL ||
    (process.env.NODE_ENV === "production" &&
      process.env.ALLOW_LOCAL_STORE !== "true")
  ) {
    throw new GameError(
      "Multiplayer storage is not configured. Add the Upstash Redis environment variables to enable rooms.",
      503,
    );
  }
  return "local";
}
// Upstash normally answers in tens of milliseconds. A call that stalls for
// seconds is almost always a dead connection, and a fresh request succeeds, so
// fail each call quickly enough that a mutation (several serial calls) still
// answers well inside the browser's request deadline.
const commandTimeout = () => Number(process.env.RALLY_REDIS_TIMEOUT_MS) || 1200;
const unavailable = () =>
  new GameError(
    "Room storage is temporarily unavailable. Please retry.",
    503,
    "STORAGE_SLOW",
  );
class TransportError extends Error {}
async function send<T>(
  args: (string | number)[],
  signal?: AbortSignal,
): Promise<T> {
  const credentials = redisCredentials();
  if (!credentials)
    throw new GameError("Redis storage is not configured.", 503);
  let response: Response, json: { result?: T; error?: unknown };
  try {
    response = await fetch(credentials.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(commandTimeout())])
        : AbortSignal.timeout(commandTimeout()),
    });
    if (response.status >= 500) throw new TransportError();
    json = await response.json();
  } catch {
    // Timeout, reset connection, gateway error or a truncated body.
    throw new TransportError();
  }
  if (!response.ok || json.error) throw unavailable();
  return json.result as T;
}
// A stalled read should not hold a game behind one bad connection. A second
// independent read starts only on the slow path; neither request can write.
async function readCommand<T>(args: (string | number)[]): Promise<T> {
  const first = new AbortController(),
    second = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.any([
      send<T>(args, first.signal),
      new Promise<T>((resolve, reject) => {
        timer = setTimeout(() => {
          send<T>(args, second.signal).then(resolve, reject);
        }, 200);
      }),
    ]);
  } catch (error) {
    if (error instanceof AggregateError) {
      const permanent = error.errors.find(
        (e) => !(e instanceof TransportError),
      );
      if (permanent) throw permanent;
    }
    throw unavailable();
  } finally {
    clearTimeout(timer);
    first.abort();
    second.abort();
  }
}
// `retry` is only safe when repeating the command cannot change the outcome:
// reads, and rate-limit bookings (a duplicate only spends the caller's own
// allowance; it can never grant extra requests). A CAS write is never
// repeated at this layer: it may have been applied before its reply was lost.
async function command<T>(
  args: (string | number)[],
  options: { retry?: boolean } = {},
): Promise<T> {
  return measure("redis", async () => {
    if (options.retry && ["GET", "MGET"].includes(String(args[0])))
      return readCommand<T>(args);
    for (let attempt = 0; ; attempt++) {
      try {
        return await send<T>(args);
      } catch (error) {
        if (!(error instanceof TransportError)) throw error;
        if (!options.retry || attempt > 0) throw unavailable();
      }
    }
  });
}

async function readLocal(): Promise<Record<string, RecordValue>> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}
export async function read(key: string): Promise<string | null> {
  if (storageMode() === "redis") return command(["GET", key], { retry: true });
  const item = (await readLocal())[key];
  return item && (!item.expires || item.expires > Date.now())
    ? item.value
    : null;
}
export async function readMany(keys: string[]): Promise<(string | null)[]> {
  if (!keys.length) return [];
  if (storageMode() === "redis")
    return command(["MGET", ...keys], { retry: true });
  const data = await readLocal(),
    now = Date.now();
  return keys.map((key) => {
    const item = data[key];
    return item && (!item.expires || item.expires > now) ? item.value : null;
  });
}
export const roomCacheEnabled = () =>
  storageMode() === "redis" && process.env.RALLY_DISABLE_ROOM_CACHE !== "true";
// Polls read Redis directly. (Next's Data Cache was used here before, but every
// guess invalidated it, so it rarely hit, and its lookups were not bounded by
// the Redis timeout: production polls occasionally hung for 15s+.) Within one
// function instance, concurrent polls for a room share one GET, and a value
// read or written here is reused for 100ms to combine simultaneous polls.
const ROOM_REUSE_MS = 100;
const roomReads = new Map<string, Promise<string | null>>();
const recentRooms = new Map<string, { value: string | null; at: number }>();
function rememberRoom(code: string, value: string | null) {
  recentRooms.delete(code);
  recentRooms.set(code, { value, at: Date.now() });
  if (recentRooms.size > 512)
    recentRooms.delete(recentRooms.keys().next().value!);
}
export function readRoomCached(
  code: string,
  now = Date.now(),
): Promise<string | null> {
  const recent = recentRooms.get(code);
  if (recent && now - recent.at < ROOM_REUSE_MS)
    return Promise.resolve(recent.value);
  const existing = roomReads.get(code);
  if (existing) return existing;
  const before = recentRooms.get(code);
  const pending = command<string | null>(["GET", `rally:room:${code}`], {
    retry: true,
  })
    .then((value) => {
      // A guess may finish while this older GET is in flight. Its committed
      // snapshot wins; don't replace it with the late read's older revision.
      const updated = recentRooms.get(code);
      if (updated && updated !== before) return updated.value;
      rememberRoom(code, value);
      return value;
    })
    .finally(() => roomReads.delete(code));
  roomReads.set(code, pending);
  return pending;
}
const casScript = `
local actual = redis.call('MGET',unpack(KEYS))
for i,key in ipairs(KEYS) do
 local expected = ARGV[(i-1)*3+1]
 if (actual[i] or '') ~= expected then return {0,actual[1] or false} end
end
local persistent = {}
for i,key in ipairs(KEYS) do
 local value = ARGV[(i-1)*3+2]
 local ttl = tonumber(ARGV[(i-1)*3+3])
 if ttl > 0 then redis.call('SET',key,value,'EX',ttl)
 else table.insert(persistent,key); table.insert(persistent,value) end
end
if #persistent > 0 then redis.call('MSET',unpack(persistent)) end
return {1}`;
async function commit(
  writes: Write[],
  conflict?: (current: string | null) => void,
): Promise<boolean> {
  if (!writes.length) return true;
  if (storageMode() === "redis") {
    const result = await command<[number, (string | null)?]>([
      "EVAL",
      casScript,
      writes.length,
      ...writes.map((w) => w.key),
      ...writes.flatMap((w) => [w.expected ?? "", w.value, w.ttl ?? 0]),
    ]);
    if (result[0] !== 1) conflict?.(result[1] || null);
    return result[0] === 1;
  }
  await mkdir(directory, { recursive: true });
  const lock = path.join(directory, "lock");
  let acquired = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await mkdir(lock);
      acquired = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  if (!acquired)
    throw new GameError("Local room storage is busy. Retry in a moment.", 503);
  try {
    const data = await readLocal();
    const now = Date.now();
    for (const [key, item] of Object.entries(data))
      if (item.expires && item.expires <= now) delete data[key];
    if (writes.some((w) => (data[w.key]?.value ?? null) !== w.expected)) {
      conflict?.(data[writes[0].key]?.value ?? null);
      return false;
    }
    for (const w of writes)
      data[w.key] = {
        value: w.value,
        ...(w.ttl ? { expires: now + w.ttl * 1000 } : {}),
      };
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(data));
    await rename(temporary, file);
    return true;
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
export async function compareAndSet(
  writes: Write[],
  conflict?: (current: string | null) => void,
): Promise<boolean> {
  return measure("commit", async () => {
    let saved: boolean;
    try {
      saved = await commit(writes, conflict);
    } catch (error) {
      // An unanswered CAS may or may not have applied; drop optimistic copies.
      for (const item of writes) {
        forgetMutation(item.key);
        recentRooms.delete(item.key.replace(/^rally:room:/, ""));
      }
      throw error;
    }
    for (const item of writes) {
      if (saved) rememberMutation(item.key, item.value);
      else forgetMutation(item.key);
      const room = /^rally:room:(.+)$/.exec(item.key)?.[1];
      if (room) {
        if (saved) rememberRoom(room, item.value);
        else recentRooms.delete(room);
      }
    }
    return saved;
  });
}
export async function prefetchRateLimit(
  id: string,
  bucket: string,
  maximum: number,
) {
  if (
    maximum < 100 ||
    process.env.RALLY_DISABLE_RATE_RESERVATIONS === "true" ||
    process.env.RALLY_DISABLE_RATE_PREFETCH === "true"
  )
    return;
  await rateReservations.prefetch(id, bucket, maximum);
}

async function reserveRateSlots(key: string, amount: number, maximum: number) {
  if (storageMode() === "redis")
    return command<number>(
      [
        "EVAL",
        `local used=tonumber(redis.call('GET',KEYS[1]) or '0')
local amount=math.min(tonumber(ARGV[1]),math.max(0,tonumber(ARGV[2])-used))
if amount>0 then redis.call('SET',KEYS[1],used+amount,'EX',60) end
return amount`,
        1,
        key,
        amount,
        maximum,
      ],
      { retry: true },
    );
  for (let retry = 0; retry < 8; retry++) {
    const old = await read(key),
      used = Number(old ?? 0),
      granted = Math.min(amount, Math.max(0, maximum - used));
    if (!granted) return 0;
    if (
      await compareAndSet([
        { key, expected: old, value: String(used + granted), ttl: 60 },
      ])
    )
      return granted;
  }
  throw new GameError("Too many simultaneous actions. Please retry.", 409);
}
const rateReservations = new ReservationLimiter(reserveRateSlots);

async function takeRateLimit(
  identity: string,
  bucket: string,
  maximum: number,
): Promise<void> {
  const mode = storageMode();
  // Keep low-volume creation/join limits exact per request. Only the larger
  // gameplay buckets reserve slots, and storage still enforces their global cap.
  if (maximum >= 100 && process.env.RALLY_DISABLE_RATE_RESERVATIONS !== "true")
    return rateReservations.take(identity, bucket, maximum);
  const key = `rally:rate:${identity}:${bucket}:${Math.floor(Date.now() / 60000)}`;
  if (mode === "redis") {
    const count = await command<number>(
      [
        "EVAL",
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n",
        1,
        key,
      ],
      { retry: true },
    );
    if (count > maximum)
      throw new GameError(
        "Too many requests. Wait a minute and try again.",
        429,
      );
    return;
  }
  for (let i = 0; i < 8; i++) {
    const old = await read(key),
      count = Number(old ?? 0) + 1;
    if (count > maximum)
      throw new GameError(
        "Too many requests. Wait a minute and try again.",
        429,
      );
    if (
      await compareAndSet([
        { key, expected: old, value: String(count), ttl: 60 },
      ])
    )
      return;
  }
  throw new GameError("Too many simultaneous actions. Please retry.", 409);
}

export async function rateLimit(
  identity: string,
  bucket: string,
  maximum: number,
): Promise<void> {
  return measure("limit", () => takeRateLimit(identity, bucket, maximum));
}
