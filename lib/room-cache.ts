import { requireGame } from "./engine";
import { revalidateTag } from "next/cache";
import { roomCacheEnabled, roomCacheTag, readRoomCached } from "./store";
import { roomAction, roomSnapshot } from "./service";

export function invalidateRoom(code: string) {
  if (!roomCacheEnabled()) return;
  try {
    revalidateTag(roomCacheTag(code), { expire: 0 });
  } catch {
    console.error(
      "Room cache invalidation failed; the ten-second snapshot window still bounds staleness.",
    );
  }
}
export async function readRoom(code: string, id: string, minimumRevision = 0) {
  requireGame(
    Number.isSafeInteger(minimumRevision) && minimumRevision >= 0,
    "Invalid room revision.",
  );
  if (!roomCacheEnabled()) return roomAction(code, id);
  const { view, fresh } = await roomSnapshot(
    code,
    id,
    () => readRoomCached(code),
    minimumRevision,
  );
  if (fresh) invalidateRoom(code);
  return view;
}
