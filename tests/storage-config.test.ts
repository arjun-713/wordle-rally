import assert from "node:assert/strict";
import test from "node:test";
import { redisCredentials } from "../lib/store";

test("Redis uses a complete writable credential pair, with explicit credentials preferred", () => {
  const marketplace = {
    KV_REST_API_URL: "https://marketplace.example",
    KV_REST_API_TOKEN: "fixture-write-token",
  };
  const explicit = {
    UPSTASH_REDIS_REST_URL: "https://explicit.example",
    UPSTASH_REDIS_REST_TOKEN: "fixture-explicit-token",
  };
  for (const [env, expected] of [
    [
      marketplace,
      {
        url: marketplace.KV_REST_API_URL,
        token: marketplace.KV_REST_API_TOKEN,
      },
    ],
    [
      { ...marketplace, ...explicit },
      {
        url: explicit.UPSTASH_REDIS_REST_URL,
        token: explicit.UPSTASH_REDIS_REST_TOKEN,
      },
    ],
    [
      {
        ...marketplace,
        UPSTASH_REDIS_REST_URL: explicit.UPSTASH_REDIS_REST_URL,
      },
      {
        url: marketplace.KV_REST_API_URL,
        token: marketplace.KV_REST_API_TOKEN,
      },
    ],
    [
      {
        UPSTASH_REDIS_REST_URL: explicit.UPSTASH_REDIS_REST_URL,
        KV_REST_API_TOKEN: marketplace.KV_REST_API_TOKEN,
      },
      null,
    ],
    [
      {
        KV_REST_API_URL: marketplace.KV_REST_API_URL,
        KV_REST_API_READ_ONLY_TOKEN: "fixture-read-only-token",
      },
      null,
    ],
  ] as const)
    assert.deepEqual(redisCredentials(env), expected);
});
