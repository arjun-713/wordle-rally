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
export async function readRoom(
  code: string,
  id: string,
  minimumRevision = 0,
  fresh = false,
) {
  requireGame(
    Number.isSafeInteger(minimumRevision) && minimumRevision >= 0,
    "Invalid room revision.",
  );
  // A client that just lost a reply cannot trust a snapshot from before it.
  // Read through the live path and replace the cached window with it.
  if (fresh) {
    const room = await roomAction(code, id);
    invalidateRoom(room.code);
    return room;
  }
  if (!roomCacheEnabled()) return roomAction(code, id);
  const snapshot = await roomSnapshot(
    code,
    id,
    () => readRoomCached(code),
    minimumRevision,
  );
  if (snapshot.fresh) invalidateRoom(code);
  return snapshot.view;
}
