import { body, identity, respond } from "@/lib/http";
import { validateGuessInput } from "@/lib/guess-input";
import { readRoom, invalidateRoom } from "@/lib/room-cache";
import { roomAction } from "@/lib/service";
import { rateLimit } from "@/lib/store";
export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };
export async function GET(request: Request, context: Context) {
  return respond(async () => {
    const { code } = await context.params,
      id = await identity();
    const params = new URL(request.url).searchParams;
    const known = params.get("revision");
    const fresh = params.get("fresh") === "1";
    const revision = fresh ? 0 : Number(known ?? 0);
    const room = await readRoom(code.toUpperCase(), id, revision, fresh);
    if (!fresh && known !== null && room.revision === revision)
      return {
        unchanged: true,
        revision: room.revision,
        serverTime: room.serverTime,
      };
    return room;
  });
}
export async function POST(request: Request, context: Context) {
  return respond(async () => {
    const input = await body(request);
    validateGuessInput(input);
    const { code } = await context.params,
      id = await identity();
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "";
    if (ip) input.ip = ip;
    await rateLimit(
      id,
      input.action === "join" ? "join" : "actions",
      input.action === "join" ? 20 : 100,
    );
    const room = await roomAction(code.toUpperCase(), id, input);
    invalidateRoom(room.code);
    return room;
  });
}
