import test from "node:test";
import assert from "node:assert/strict";
import { redisCredentials } from "../lib/store";

test("accepts Vercel Marketplace's complete Redis REST credential pair", () => {
  assert.deepEqual(
    redisCredentials({
      KV_REST_API_URL: "https://marketplace.example",
      KV_REST_API_TOKEN: "fixture-write-token",
    }),
    { url: "https://marketplace.example", token: "fixture-write-token" },
  );
});
test("explicit Upstash credentials take precedence when both complete pairs exist", () => {
  assert.deepEqual(
    redisCredentials({
      UPSTASH_REDIS_REST_URL: "https://explicit.example",
      UPSTASH_REDIS_REST_TOKEN: "fixture-explicit-token",
      KV_REST_API_URL: "https://marketplace.example",
      KV_REST_API_TOKEN: "fixture-marketplace-token",
    }),
    { url: "https://explicit.example", token: "fixture-explicit-token" },
  );
});
test("does not mix providers or substitute a read-only token for game writes", () => {
  assert.equal(
    redisCredentials({
      UPSTASH_REDIS_REST_URL: "https://explicit.example",
      KV_REST_API_TOKEN: "fixture-other-token",
    }),
    null,
  );
  assert.equal(
    redisCredentials({
      KV_REST_API_URL: "https://marketplace.example",
      KV_REST_API_READ_ONLY_TOKEN: "fixture-read-only-token",
    }),
    null,
  );
});
test("a partial explicit configuration can fall back to a complete Marketplace pair", () => {
  assert.deepEqual(
    redisCredentials({
      UPSTASH_REDIS_REST_URL: "https://partial.example",
      KV_REST_API_URL: "https://marketplace.example",
      KV_REST_API_TOKEN: "fixture-write-token",
    }),
    { url: "https://marketplace.example", token: "fixture-write-token" },
  );
});
