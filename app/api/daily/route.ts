import { after } from "next/server";
import { body, identity, respond } from "@/lib/http";
import { validateGuessInput } from "@/lib/guess-input";
import { dailyAction } from "@/lib/daily";
import { rateLimit, prefetchRateLimit } from "@/lib/store";
export const runtime = "nodejs";
export async function GET() {
  return respond(async () => dailyAction(await identity()));
}
export async function POST(request: Request) {
  return respond(async () => {
    const input = await body(request);
    validateGuessInput(input);
    const id = await identity();
    await rateLimit(id, "daily", 120);
    const result = await dailyAction(id, input);
    if (result?.status === "playing")
      after(() => prefetchRateLimit(id, "daily", 120).catch(() => {}));
    return result;
  });
}
