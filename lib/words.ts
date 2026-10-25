import { createHmac } from "node:crypto";
import answers from "@/data/answers.json";
import calendar from "@/data/daily-calendar.json";
import { requireGame } from "./engine";
import type { Difficulty } from "./types";

// Append to this checked-in calendar; never regenerate past or assigned words.
export const dailyWords = calendar.words;
const reserved = new Set(dailyWords);
const randomWords = answers.filter((word) => !reserved.has(word));
export const pools = {
  familiar: randomWords.slice(0, 500),
  challenging: randomWords.slice(500),
  mixed: randomWords,
};
export function difficulty(value: unknown = "mixed"): Difficulty {
  requireGame(
    value === "familiar" || value === "challenging" || value === "mixed",
    "Choose Familiar, Challenging, or Mixed difficulty.",
  );
  return value;
}
export const DAILY_START = calendar.start;
let cachedSecret: string | undefined;
let protectedOrder = dailyWords;
export function dailyPuzzle(
  now = Date.now(),
  secret = process.env.RALLY_DAILY_SECRET,
) {
  const hosted =
    !!process.env.VERCEL ||
    (process.env.NODE_ENV === "production" &&
      process.env.ALLOW_LOCAL_STORE !== "true");
  requireGame(
    !hosted || secret,
    "The daily challenge is not configured. Set the server-only daily secret.",
    503,
  );
  requireGame(
    !secret || /^[a-f0-9]{64}$/.test(secret),
    "The daily challenge secret must be 32 random bytes in hexadecimal.",
    503,
  );
  if (secret !== cachedSecret) {
    protectedOrder = secret
      ? dailyWords
          .map((word) => ({
            word,
            rank: createHmac("sha256", secret)
              .update(`rally-daily-v1:${word}`)
              .digest("hex"),
          }))
          .sort((a, b) => a.rank.localeCompare(b.rank))
          .map(({ word }) => word)
      : dailyWords;
    cachedSecret = secret;
  }
  const date = new Date(now).toISOString().slice(0, 10);
  const index = Math.floor(
    (Date.parse(date) - Date.parse(DAILY_START)) / 86400000,
  );
  requireGame(
    index >= 0 && index < dailyWords.length,
    "The daily calendar needs more words. Unlimited and private rooms are still available.",
    503,
  );
  return {
    date,
    answer: protectedOrder[index],
    number: index + 1,
    resetsAt: Date.parse(date) + 86400000,
  };
}
