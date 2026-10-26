import { body, identity, respond } from "@/lib/http";
import { readRoom, invalidateRoom } from "@/lib/room-cache";
import { roomAction } from "@/lib/service";
import { rateLimit } from "@/lib/store";
export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };
export async function GET(request: Request, context: Context) {
  return respond(async () => {
    const { code } = await context.params,
      id = await identity();
    const known = new URL(request.url).searchParams.get("revision");
    const revision = Number(known ?? 0);
    const room = await readRoom(code.toUpperCase(), id, revision);
    if (known !== null && room.revision === revision)
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
    const input = await body(request),
      { code } = await context.params,
      id = await identity();
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
