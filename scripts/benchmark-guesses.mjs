// Isolated Redis latency comparison. No production credentials or data are used.
// Inject 40ms per Redis HTTP call to expose serial round trips consistently.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "redis";
import { readFile } from "node:fs/promises";
const redis = createClient({
  url: process.env.REDIS_TEST_URL ?? "redis://127.0.0.1:6389",
  socket: { reconnectStrategy: false },
});
redis.on("error", () => {});
await redis.connect();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const token = "isolated-guess-latency-fixture",
  delay = 40;
const bridge = createServer(async (request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.headers.authorization !== `Bearer ${token}`) {
    response.writeHead(401);
    response.end("{}");
    return;
  }
  try {
    let body = "";
    for await (const chunk of request) body += chunk;
    await sleep(delay);
    const result = await redis.sendCommand(JSON.parse(body).map(String));
    response.end(JSON.stringify({ result }));
  } catch (error) {
    response.end(JSON.stringify({ error: error.message }));
  }
});
await new Promise((resolve) => bridge.listen(0, "127.0.0.1", resolve));
async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
const words = JSON.parse(
  await readFile(new URL("../data/guesses.json", import.meta.url)),
);
const results = [];
try {
  for (const disabled of [true, false]) {
    const port = await freePort(),
      base = `http://127.0.0.1:${port}`;
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
          RALLY_DISABLE_MUTATION_CACHE: String(disabled),
          RALLY_DISABLE_RATE_PREFETCH: String(disabled),
          RALLY_DISABLE_ROOM_CACHE: "true",
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let errors = "";
    child.stderr.on("data", (chunk) => (errors += chunk));
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(base)).ok) {
            ready = true;
            break;
          }
        } catch {}
        await sleep(100);
      }
      assert.ok(ready, errors);
      for (const mode of ["solo", "duel"]) {
        const clients = [{ cookie: "" }, { cookie: "" }];
        async function post(path, data, client = clients[0]) {
          const start = performance.now();
          const response = await fetch(base + path, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(client.cookie ? { cookie: client.cookie } : {}),
            },
            body: JSON.stringify(data),
          });
          if (response.headers.get("set-cookie"))
            client.cookie = response.headers.get("set-cookie").split(";")[0];
          const value = await response.json();
          assert.equal(response.status, 200, value.error);
          return {
            value,
            ms: Math.round(performance.now() - start),
            timing: response.headers.get("server-timing"),
          };
        }
        let path, view, answer;
        if (mode === "solo") {
          path = "/api/solo";
          view = (await post(path, { action: "start" })).value;
          const id = createHash("sha256")
            .update(clients[0].cookie.split("=")[1])
            .digest("hex")
            .slice(0, 32);
          answer = JSON.parse(await redis.get(`rally:solo:${id}`)).answer;
        } else {
          view = (
            await post("/api/rooms", {
              name: "Benchmark host",
              config: { mode: "duel", players: 2, rounds: 1, seconds: 0 },
            })
          ).value;
          path = `/api/rooms/${view.code}`;
          await post(
            path,
            { action: "join", name: "Benchmark friend" },
            clients[1],
          );
          view = (await post(path, { action: "start" })).value;
          answer = JSON.parse(await redis.get(`rally:room:${view.code}`))
            .rounds[0].answer;
        }
        await sleep(150);
        const samples = [];
        for (const [index, word] of [
          ...words.filter((word) => word !== answer).slice(0, 5),
          answer,
        ].entries()) {
          const sample = await post(path, {
            action: "guess",
            word,
            ...(mode === "solo"
              ? { gameId: view.id }
              : { round: 0, matchId: view.matchId, match: 0 }),
          });
          samples.push({
            guess: index + 1,
            ms: sample.ms,
            redisCalls: Number(
              sample.timing?.match(/redis;dur=[^;]+;desc="(\d+)/)?.[1] ?? 0,
            ),
          });
          await sleep(150); // A short typing gap lets response-background work finish.
        }
        results.push({
          variant: disabled ? "baseline" : "optimized",
          mode,
          samples,
        });
      }
    } finally {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
  }
  console.log(JSON.stringify({ redisHttpDelayMs: delay, results }, null, 2));
} finally {
  await new Promise((resolve) => bridge.close(resolve));
  await redis.quit();
}
