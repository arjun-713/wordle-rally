import { body, identity, respond } from "@/lib/http";
import { createRoom, createdRoom } from "@/lib/service";
import { rateLimit } from "@/lib/store";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return respond(async () =>
    createdRoom(
      await identity(),
      new URL(request.url).searchParams.get("requestId"),
    ),
  );
}
export async function POST(request: Request) {
  return respond(async () => {
    const input = await body(request),
      id = await identity();
    await rateLimit(id, "create", 8);
    const room = await createRoom(id, input);
    return room;
  });
}
