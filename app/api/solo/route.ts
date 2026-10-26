import { body, identity, respond } from "@/lib/http";
import { validateGuessInput } from "@/lib/guess-input";
import { soloAction } from "@/lib/solo";
import { rateLimit } from "@/lib/store";
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
    return soloAction(id, input);
  });
}
