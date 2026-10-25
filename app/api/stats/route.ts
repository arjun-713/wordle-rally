import { identity, respond } from "@/lib/http";
import { getStats } from "@/lib/stats";
export const runtime = "nodejs";
export async function GET() {
  return respond(async () => getStats(await identity()));
}
