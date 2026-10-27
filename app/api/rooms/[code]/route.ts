import { after } from "next/server";
import { body, identity, respond } from "@/lib/http";
import { validateGuessInput } from "@/lib/guess-input";
import { readRoom } from "@/lib/room-cache";
import { roomAction } from "@/lib/service";
import { rateLimit, prefetchRateLimit } from "@/lib/store";
export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };
export async function GET(request: Request, context: Context) {
  return respond(async () => {
    const { code } = await context.params,
      id = await identity();
    const query = new URL(request.url).searchParams;
    // A slow mutation confirmation needs authoritative state, not a quiet-room
    // snapshot or a conditional poll reply. Normal polls retain their cache.
    if (query.get("confirm") === "1") return roomAction(code.toUpperCase(), id);
    const known = query.get("revision");
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
    const input = await body(request);
    validateGuessInput(input);
    const { code } = await context.params,
      id = await identity();
    await rateLimit(
      id,
      input.action === "join" ? "join" : "actions",
      input.action === "join" ? 20 : 100,
    );
    const room = await roomAction(code.toUpperCase(), id, input);
    if (room.status === "playing")
      after(() => prefetchRateLimit(id, "actions", 100).catch(() => {}));
    return room;
  });
}
