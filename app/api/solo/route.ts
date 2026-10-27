import { after } from "next/server";
import { body, identity, respond } from "@/lib/http";
import { validateGuessInput } from "@/lib/guess-input";
import { soloAction } from "@/lib/solo";
import { rateLimit, prefetchRateLimit } from "@/lib/store";
export const runtime = "nodejs";
export async function GET() {
  return respond(async () => soloAction(await identity()));
}
export async function POST(request: Request) {
  return respond(async () => {
    const input = await body(request);
    validateGuessInput(input);
    const id = await identity();
    await rateLimit(id, "solo", 120);
    const result = await soloAction(id, input);
    if (result?.status === "playing")
      after(() => prefetchRateLimit(id, "solo", 120).catch(() => {}));
    return result;
  });
}
