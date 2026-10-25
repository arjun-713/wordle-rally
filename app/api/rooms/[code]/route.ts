import { body, identity, respond } from "@/lib/http";
import { roomAction } from "@/lib/service";
import { rateLimit } from "@/lib/store";
export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };
export async function GET(_request: Request, context: Context) {
  return respond(async () => {
    const { code } = await context.params,
      id = await identity();
    return roomAction(code.toUpperCase(), id);
  });
}
export async function POST(request: Request, context: Context) {
  return respond(async () => {
    const input = await body(request),
      { code } = await context.params,
      id = await identity();
    await rateLimit(
      id,
      input.action === "join" ? "join" : "actions",
      input.action === "join" ? 20 : 100,
    );
    return roomAction(code.toUpperCase(), id, input);
  });
}
