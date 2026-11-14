import { body, identity, respond } from "@/lib/http";
import { createRoom } from "@/lib/service";
import { rateLimit } from "@/lib/store";
export const runtime = "nodejs";
// A no-op the home page calls so this function is warm before "Create room".
// It touches no storage, so it costs no Redis commands.
export async function GET() {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
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
