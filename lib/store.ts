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
async function command<T>(
  args: (string | number)[],
  snapshot?: { tag: string; window: number },
): Promise<T> {
  const credentials = redisCredentials();
  if (!credentials)
    throw new GameError("Redis storage is not configured.", 503);
  const response = await fetch(credentials.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credentials.token}`,
      "Content-Type": "application/json",
      ...(snapshot
        ? { "X-Rally-Snapshot-Window": String(snapshot.window) }
        : {}),
    },
    body: JSON.stringify(args),
    cache: snapshot ? "force-cache" : "no-store",
    ...(snapshot ? { next: { revalidate: 20, tags: [snapshot.tag] } } : {}),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok)
    throw new GameError(
      "Room storage is temporarily unavailable. Please retry.",
      503,
    );
  const json = await response.json();
  if (json.error)
    throw new GameError(
      "Room storage is temporarily unavailable. Please retry.",
      503,
    );
  return json.result;
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
  if (storageMode() === "redis") return command(["GET", key]);
  const item = (await readLocal())[key];
  return item && (!item.expires || item.expires > Date.now())
    ? item.value
    : null;
}
export async function readMany(keys: string[]): Promise<(string | null)[]> {
  if (!keys.length) return [];
  if (storageMode() === "redis") return command(["MGET", ...keys]);
  const data = await readLocal(),
    now = Date.now();
  return keys.map((key) => {
    const item = data[key];
    return item && (!item.expires || item.expires > now) ? item.value : null;
  });
}
export const roomCacheTag = (code: string) => `rally-room:${code}`;
export const roomCacheEnabled = () =>
  storageMode() === "redis" && process.env.RALLY_DISABLE_ROOM_CACHE !== "true";
// Collapse concurrent cold-cache requests within a function instance. Only
// in-flight work is held here; persisted snapshots live in Next's Data Cache.
const roomReads = new Map<string, Promise<string | null>>();
// Only the raw server snapshot is shared. User-specific responses stay private.
// The window is part of fetch's cache key, so an old snapshot is never reused
// beyond ten seconds, including when Redis is unavailable during revalidation.
export function readRoomCached(
  code: string,
  now = Date.now(),
): Promise<string | null> {
  const window = Math.floor(now / 10000),
    key = `${code}:${window}`;
  const existing = roomReads.get(key);
  if (existing) return existing;
  const pending = command<string | null>(["GET", `rally:room:${code}`], {
    tag: roomCacheTag(code),
    window,
  }).finally(() => roomReads.delete(key));
  roomReads.set(key, pending);
  return pending;
}
const casScript = `
local actual = redis.call('MGET',unpack(KEYS))
for i,key in ipairs(KEYS) do
 local expected = ARGV[(i-1)*3+1]
 if (actual[i] or '') ~= expected then return 0 end
end
local persistent = {}
for i,key in ipairs(KEYS) do
 local value = ARGV[(i-1)*3+2]
 local ttl = tonumber(ARGV[(i-1)*3+3])
 if ttl > 0 then redis.call('SET',key,value,'EX',ttl)
 else table.insert(persistent,key); table.insert(persistent,value) end
end
if #persistent > 0 then redis.call('MSET',unpack(persistent)) end
return 1`;
export async function compareAndSet(writes: Write[]): Promise<boolean> {
  if (!writes.length) return true;
  if (storageMode() === "redis") {
    return (
      (await command<number>([
        "EVAL",
        casScript,
        writes.length,
        ...writes.map((w) => w.key),
        ...writes.flatMap((w) => [w.expected ?? "", w.value, w.ttl ?? 0]),
      ])) === 1
    );
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
    if (writes.some((w) => (data[w.key]?.value ?? null) !== w.expected))
      return false;
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
async function reserveRateSlots(key: string, amount: number, maximum: number) {
  if (storageMode() === "redis")
    return command<number>([
      "EVAL",
      `local used=tonumber(redis.call('GET',KEYS[1]) or '0')
local amount=math.min(tonumber(ARGV[1]),math.max(0,tonumber(ARGV[2])-used))
if amount>0 then redis.call('SET',KEYS[1],used+amount,'EX',60) end
return amount`,
      1,
      key,
      amount,
      maximum,
    ]);
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

export async function rateLimit(
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
    const count = await command<number>([
      "EVAL",
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n",
      1,
      key,
    ]);
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
