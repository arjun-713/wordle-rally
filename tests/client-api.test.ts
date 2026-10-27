import assert from "node:assert/strict";
import test from "node:test";
import { api, ApiError, isGuessRejection } from "../lib/client-api";

test("client API retains typed guess rejection errors and successful response data", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error: "Unknown word", code: "INVALID_GUESS" },
      { status: 400 },
    ),
  );
  await assert.rejects(
    api("/api/solo", { action: "guess", word: "zzzzz" }),
    (error: unknown) => isGuessRejection(error) && error.status === 400,
  );
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ status: "lost", guesses: Array(6).fill({}) }),
  );
  const response = await api<{ status: string; guesses: unknown[] }>(
    "/api/solo",
  );
  assert.equal(response.status, "lost");
  assert.equal(response.guesses.length, 6);
});
test("a stalled fetch times out and aborts without retrying a mutation", async (t) => {
  let calls = 0,
    signal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => {
    calls++;
    signal = options.signal ?? undefined;
    return new Promise<Response>(() => {});
  });
  await assert.rejects(
    api("/api/solo", { action: "guess", word: "rates" }, undefined, 10),
    (error: unknown) =>
      error instanceof ApiError && error.code === "REQUEST_TIMEOUT",
  );
  assert.equal(calls, 1);
  assert.equal(signal?.aborted, true);

  // A response whose body never arrives shares the same deadline.
  t.mock.method(
    globalThis,
    "fetch",
    async () => ({ ok: true, json: () => new Promise(() => {}) }) as Response,
  );
  await assert.rejects(
    api("/api/solo", undefined, undefined, 10),
    (error: unknown) =>
      error instanceof ApiError && error.code === "REQUEST_TIMEOUT",
  );
});
test("caller cancellation remains distinguishable from a transport failure", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    (_url: unknown, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
  );
  const controller = new AbortController();
  const pending = api("/api/rooms/ABCDEF", undefined, controller.signal);
  controller.abort();
  await assert.rejects(
    pending,
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
  );
});

test("a slow committed guess is recovered from a matching snapshot without repeating its POST", async (t) => {
  const { guessApi } = await import("../lib/client-api");
  let posts = 0,
    gets = 0;
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => {
    if (options.method === "POST") {
      posts++;
      return new Promise<Response>((_, reject) =>
        options.signal!.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        ),
      );
    }
    gets++;
    return Promise.resolve(Response.json({ id: "same-game", saved: true }));
  });
  const result = await guessApi<{ id: string; saved: boolean }>(
    "/api/solo",
    { action: "guess", word: "crane" },
    (value) => value.id === "same-game" && value.saved,
    5,
  );
  assert.equal(result.saved, true);
  assert.equal(posts, 1);
  assert.equal(gets, 1);
});

test("guess recovery keeps checking when its first read races the commit", async (t) => {
  const { guessApi } = await import("../lib/client-api");
  let posts = 0,
    gets = 0;
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => {
    if (options.method === "POST") {
      posts++;
      return hang(options);
    }
    return Promise.resolve(Response.json({ saved: ++gets >= 2 }));
  });
  const result = await guessApi<{ saved: boolean }>(
    "/api/rooms/ABCDEF",
    { action: "guess", word: "crane" },
    (snapshot) => snapshot.saved,
    5,
  );
  assert.equal(result.saved, true);
  assert.equal(posts, 1);
  assert.equal(gets, 2);
});

const hang = (options: RequestInit) =>
  new Promise<Response>((_, reject) =>
    options.signal!.addEventListener(
      "abort",
      () => reject(new DOMException("Aborted", "AbortError")),
      { once: true },
    ),
  );

test("a timed-out mutation that was saved is confirmed without a second POST", async (t) => {
  const { mutationApi } = await import("../lib/client-api");
  let posts = 0,
    gets = 0;
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => {
    if (options.method === "POST") {
      posts++;
      return hang(options);
    }
    gets++;
    return Promise.resolve(Response.json({ joined: true }));
  });
  const result = await mutationApi<{ joined: boolean }>(
    "/api/rooms/ABCDEF",
    { action: "join", name: "Asha" },
    {
      confirmUrl: "/api/rooms/ABCDEF?confirm=1",
      confirmed: (room) => room.joined,
      timeoutMs: 10,
      retryDelayMs: 0,
    },
  );
  assert.equal(result.joined, true);
  assert.equal(posts, 1);
  assert.equal(gets, 1);
});

test("an unsaved mutation is retried once after a busy reply", async (t) => {
  const { mutationApi } = await import("../lib/client-api");
  let posts = 0;
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => {
    if (options.method === "POST")
      return Promise.resolve(
        ++posts === 1
          ? Response.json(
              { error: "The room is busy.", code: "BUSY" },
              { status: 409 },
            )
          : Response.json({ started: true }),
      );
    return Promise.resolve(Response.json({ started: false }));
  });
  const result = await mutationApi<{ started: boolean }>(
    "/api/rooms/ABCDEF",
    { action: "start" },
    {
      confirmUrl: "/api/rooms/ABCDEF?confirm=1",
      confirmed: (room) => room.started,
      retryDelayMs: 0,
    },
  );
  assert.equal(result.started, true);
  assert.equal(posts, 2);
});

test("a retried guess rejected as a duplicate is accepted once confirmed", async (t) => {
  const { mutationApi } = await import("../lib/client-api");
  let posts = 0,
    gets = 0;
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => {
    if (options.method === "POST")
      return Promise.resolve(
        ++posts === 1
          ? Response.json({ error: "Storage slow" }, { status: 503 })
          : Response.json(
              { error: "You already tried that word.", code: "INVALID_GUESS" },
              { status: 400 },
            ),
      );
    // The first confirmation races the commit; the second sees it.
    return Promise.resolve(Response.json({ saved: ++gets > 1 }));
  });
  const result = await mutationApi<{ saved: boolean }>(
    "/api/solo",
    { action: "guess", word: "crane" },
    {
      confirmUrl: "/api/solo",
      confirmed: (game) => game.saved,
      probeAfterMs: 10_000,
      retryDelayMs: 0,
    },
  );
  assert.equal(result.saved, true);
  assert.equal(posts, 2);
});

test("validation errors and unconfirmed retries surface without extra attempts", async (t) => {
  const { mutationApi } = await import("../lib/client-api");
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json(
      { error: "This match has already started." },
      { status: 400 },
    );
  });
  const options = {
    confirmUrl: "/api/rooms/ABCDEF?confirm=1",
    confirmed: () => false,
    retryDelayMs: 0,
  };
  await assert.rejects(
    mutationApi("/api/rooms/ABCDEF", { action: "start" }, options),
    (error: unknown) => error instanceof ApiError && error.status === 400,
  );
  assert.equal(calls, 1);

  calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new TypeError("offline");
  });
  await assert.rejects(
    mutationApi("/api/rooms/ABCDEF", { action: "start" }, options),
    (error: unknown) =>
      error instanceof ApiError && error.code === "NETWORK_ERROR",
  );
  // POST, confirm, retry POST, confirm.
  assert.equal(calls, 4);
});

test("a saved leave whose reply was lost resolves when membership is gone", async (t) => {
  const { mutationApi } = await import("../lib/client-api");
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) =>
    options.method === "POST"
      ? hang(options)
      : Promise.resolve(
          Response.json({ error: "Join this room." }, { status: 403 }),
        ),
  );
  const result = await mutationApi<{ code: string }>(
    "/api/rooms/ABCDEF",
    { action: "leave" },
    {
      confirmUrl: "/api/rooms/ABCDEF?confirm=1",
      confirmed: () => false,
      gone: { code: "ABCDEF" },
      timeoutMs: 10,
      retryDelayMs: 0,
    },
  );
  assert.equal(result.code, "ABCDEF");
});

test("polling reads retry once after a transport failure", async (t) => {
  const { readApi } = await import("../lib/client-api");
  let calls = 0;
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) =>
    ++calls === 1
      ? hang(options)
      : Promise.resolve(Response.json({ revision: 4 })),
  );
  const result = await readApi<{ revision: number }>(
    "/api/rooms/ABCDEF",
    undefined,
    10,
  );
  assert.equal(result.revision, 4);
  assert.equal(calls, 2);

  calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({ error: "Not found" }, { status: 404 });
  });
  await assert.rejects(readApi("/api/rooms/ABCDEF"));
  assert.equal(calls, 1);
});

test("room action predicates recognise each saved action", async () => {
  const { roomActionConfirmed } = await import("../lib/client-api");
  type Room = import("../lib/types").PublicRoom;
  const base = {
    code: "ABCDEF",
    host: "me",
    me: "me",
    matchId: "m1",
    match: 0,
    status: "lobby",
    round: 0,
    revision: 3,
    config: { mode: "free", players: 4, rounds: 3, seconds: 0 },
    players: [{ id: "me", name: "Asha", team: 0, score: 0, active: true }],
    current: null,
  } as unknown as Room;
  const room = (patch: Partial<Room>) => ({ ...base, ...patch }) as Room;
  const check = (data: Record<string, unknown>, next: Room, before = base) =>
    roomActionConfirmed(before, data, next);

  assert.equal(check({ action: "join" }, base, null as unknown as Room), true);
  assert.equal(check({ action: "join" }, room({ players: [] })), false);
  assert.equal(check({ action: "leave" }, room({ players: [] })), true);
  assert.equal(check({ action: "leave" }, base), false);
  assert.equal(
    check(
      { action: "team", team: 1 },
      room({ players: [{ ...base.players[0], team: 1 }] }),
    ),
    true,
  );
  assert.equal(check({ action: "team", team: 1 }, base), false);
  assert.equal(
    check(
      { action: "configure", config: { ...base.config, rounds: 5 } },
      room({ config: { ...base.config, rounds: 5 } }),
    ),
    true,
  );
  assert.equal(
    check({ action: "configure", config: { ...base.config, rounds: 5 } }, base),
    false,
  );
  assert.equal(check({ action: "start" }, room({ status: "playing" })), true);
  assert.equal(check({ action: "start" }, base), false);
  const playing = room({ status: "playing" });
  assert.equal(
    check(
      { action: "next", round: 0 },
      room({ status: "playing", round: 1 }),
      playing,
    ),
    true,
  );
  assert.equal(check({ action: "next", round: 0 }, playing, playing), false);
  const finished = room({ status: "finished" });
  assert.equal(
    check({ action: "nextMatch" }, room({ match: 1 }), finished),
    true,
  );
  assert.equal(
    check({ action: "replay" }, room({ revision: 9 }), finished),
    true,
  );
  assert.equal(check({ action: "replay" }, finished, finished), false);
  const guessing = room({
    status: "playing",
    current: {
      guesses: [],
      solved: [],
      attempts: {},
      endsAt: 0,
      ended: false,
    },
  });
  const guessed = room({
    status: "playing",
    current: {
      ...guessing.current!,
      guesses: [{ word: "crane", marks: [] }],
    },
  });
  assert.equal(
    check({ action: "guess", word: "crane", round: 0 }, guessed, guessing),
    true,
  );
  assert.equal(
    check({ action: "guess", word: "slate", round: 0 }, guessed, guessing),
    false,
  );
});
