import assert from "node:assert/strict";
import test from "node:test";
import { body } from "../lib/http";

test("oversized streaming requests are stopped before buffering the entire body", async () => {
  let chunks = 0,
    cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      chunks++;
      controller.enqueue(new TextEncoder().encode("x".repeat(1024)));
      if (chunks === 32) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("http://localhost/api/rooms", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(body(request), /too large/);
  assert.ok(chunks < 10, `Read ${chunks} chunks before rejecting`);
  assert.ok(cancelled);
});
