import { body, identity, respond } from "@/lib/http";
import { invalidateRoom } from "@/lib/room-cache";
import { createRoom } from "@/lib/service";
import { rateLimit } from "@/lib/store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return respond(async () => {
    const input = await body(request),
      id = await identity();
    await rateLimit(id, "create", 8);
    const room = await createRoom(id, input);
    invalidateRoom(room.code);
    return room;
  });
}
