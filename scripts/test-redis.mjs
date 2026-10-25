// Run the same service suite against a real Redis server through its HTTP transport.
// This bridge emulates only the REST transport, not Redis or its Lua interpreter.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createClient } from "redis";
const redis = createClient({
  url: process.env.REDIS_TEST_URL ?? "redis://127.0.0.1:6389",
  socket: { reconnectStrategy: false },
});
redis.on("error", () => {});
await redis.connect();
const token = "isolated-local-test";
const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.headers.authorization !== `Bearer ${token}`) {
    response.writeHead(401);
    response.end("{}");
    return;
  }
  try {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 4_000_000) throw new Error("Too large");
    }
    const command = JSON.parse(body).map(String);
    const result = await redis.sendCommand(command);
    response.end(JSON.stringify({ result }));
  } catch (error) {
    response.end(JSON.stringify({ error: error.message }));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
console.log(`Testing Redis atomic operations over local HTTP on port ${port}.`);
try {
  const child = spawn("npm", ["test"], {
    stdio: "inherit",
    env: {
      ...process.env,
      UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${port}`,
      UPSTASH_REDIS_REST_TOKEN: token,
    },
  });
  const code = await new Promise((resolve) => child.on("exit", resolve));
  process.exitCode = code ?? 1;
} finally {
  await new Promise((resolve) => server.close(resolve));
  await redis.quit();
}
