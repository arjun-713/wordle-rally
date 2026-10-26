// Isolated comparison of the same API polling workload against real Redis.
// Requires a local Redis server; never uses production database credentials.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { createClient } from "redis";
import assert from "node:assert/strict";
const redis = createClient({
  url: process.env.REDIS_TEST_URL ?? "redis://127.0.0.1:6389",
  socket: { reconnectStrategy: false },
});
redis.on("error", () => {});
await redis.connect();
const token = "isolated-read-benchmark";
const bridge = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.headers.authorization !== `Bearer ${token}`) {
    response.writeHead(401);
    response.end("{}");
    return;
  }
  try {
    let body = "";
    for await (const chunk of request) body += chunk;
    response.end(
      JSON.stringify({
        result: await redis.sendCommand(JSON.parse(body).map(String)),
      }),
    );
  } catch (e) {
    response.end(JSON.stringify({ error: e.message }));
  }
});
await new Promise((resolve) => bridge.listen(0, "127.0.0.1", resolve));
async function freePort() {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
}
async function start(disabled) {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      env: {
        ...process.env,
        ALLOW_LOCAL_STORE: "true",
        UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${bridge.address().port}`,
        UPSTASH_REDIS_REST_TOKEN: token,
        RALLY_DISABLE_ROOM_CACHE: disabled ? "true" : "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  child.stdout.on("data", (d) => (logs += d));
  child.stderr.on("data", (d) => (logs += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) return { child, base, logs: () => logs };
    } catch {}
    if (child.exitCode !== null) throw new Error(logs);
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error(`Server failed: ${logs}`);
}
async function stats() {
  const info = await redis.info("commandstats"),
    out = {};
  for (const line of info.split("\n")) {
    const m = line.match(/^cmdstat_([^:]+):calls=(\d+)/);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
}
function delta(a, b) {
  return Object.fromEntries(
    Object.keys(b).map((k) => [k, (b[k] ?? 0) - (a[k] ?? 0)]),
  );
}
function charged(d) {
  return ["get", "mget", "set", "mset", "incr", "expire", "eval"].reduce(
    (n, k) => n + (d[k] ?? 0),
    0,
  );
}
async function request(base, client, code, data, revision) {
  const response = await fetch(
    `${base}/api/rooms${code ? `/${code}` : ""}${revision === undefined ? "" : `?revision=${revision}`}`,
    {
      method: data ? "POST" : "GET",
      headers: {
        ...(client.cookie ? { Cookie: client.cookie } : {}),
        ...(data ? { "Content-Type": "application/json" } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    },
  );
  const cookie = response.headers.get("set-cookie");
  if (cookie) client.cookie = cookie.split(";")[0];
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result;
}
const rows = [],
  servers = [];
try {
  const baseline = await start(true),
    optimized = await start(false);
  servers.push(baseline, optimized);
  for (const count of [2, 4, 16]) {
    const clients = Array.from({ length: count }, () => ({}));
    const room = await request(optimized.base, clients[0], null, {
      name: "Benchmark Host",
      config: {
        mode: count === 4 ? "teams" : "free",
        players: count,
        rounds: 1,
        seconds: 0,
      },
    });
    for (let i = 1; i < count; i++)
      await request(optimized.base, clients[i], room.code, {
        action: "join",
        name: `Benchmark ${i}`,
      });
    let before = await stats();
    const started = await request(optimized.base, clients[0], room.code, {
      action: "start",
    });
    const startCommands = charged(delta(before, await stats()));
    const workloads = {};
    for (const [label, server] of [
      ["baseline", baseline],
      ["optimized", optimized],
    ]) {
      // Invalidate an already warm snapshot before measuring the optimized case.
      if (label === "optimized")
        await request(optimized.base, clients[0], room.code, {
          action: "join",
          name: "Benchmark Host",
        });
      before = await stats();
      for (let wave = 0; wave < 5; wave++) {
        await Promise.all(
          clients.map((c) =>
            request(server.base, c, room.code, undefined, started.revision),
          ),
        );
        if (wave < 4) await new Promise((r) => setTimeout(r, 1000));
      }
      const used = delta(before, await stats());
      workloads[label] = {
        reads: (used.get ?? 0) + (used.mget ?? 0),
        commands: charged(used),
      };
    }
    assert.equal(workloads.baseline.reads, count * 5);
    assert.ok(
      workloads.optimized.reads <= 3,
      `Shared cache missed too often: ${JSON.stringify(workloads)}`,
    );
    const secret = JSON.parse(await redis.get(`rally:room:${room.code}`));
    const posted = await request(optimized.base, clients[0], room.code, {
      action: "guess",
      round: 0,
      matchId: started.matchId,
      word: secret.rounds[0].answer,
    });
    const guest = await request(optimized.base, clients[1], room.code);
    assert.equal(
      guest.current.attempts[posted.me],
      1,
      "Mutation did not invalidate the shared cache",
    );
    assert.equal(
      guest.current.guesses.length,
      0,
      "Cached response leaked another board",
    );
    assert.equal(guest.current.answer, undefined, "Active answer leaked");
    const unchanged = await request(
      optimized.base,
      clients[1],
      room.code,
      undefined,
      guest.revision,
    );
    assert.equal(unchanged.unchanged, true);
    assert.deepEqual(Object.keys(unchanged).sort(), [
      "revision",
      "serverTime",
      "unchanged",
    ]);
    const row = {
      players: count,
      pollRequests: count * 5,
      baselineReads: workloads.baseline.reads,
      optimizedReads: workloads.optimized.reads,
      reductionPercent: Math.round(
        (1 - workloads.optimized.reads / workloads.baseline.reads) * 100,
      ),
      matchStartCommands: startCommands,
      previousMatchStartCommands: 3 * count + 7,
      invalidation: true,
      privacy: true,
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  await mkdir(".impeccable/review", { recursive: true });
  await writeFile(
    ".impeccable/review/read-benchmark.json",
    JSON.stringify(
      {
        workload:
          "5 polls per player, one second apart; identical requests with server snapshot cache disabled/enabled",
        rows,
      },
      null,
      2,
    ),
  );
} finally {
  for (const server of servers) server.child.kill("SIGTERM");
  await new Promise((r) => bridge.close(r));
  await redis.quit();
}
