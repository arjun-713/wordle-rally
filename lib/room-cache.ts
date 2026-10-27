import { requireGame } from "./engine";
import { roomCacheEnabled, readRoomCached } from "./store";
import { roomAction, roomSnapshot } from "./service";

export async function readRoom(code: string, id: string, minimumRevision = 0) {
  requireGame(
    Number.isSafeInteger(minimumRevision) && minimumRevision >= 0,
    "Invalid room revision.",
  );
  if (!roomCacheEnabled()) return roomAction(code, id);
  const { view } = await roomSnapshot(
    code,
    id,
    () => readRoomCached(code),
    minimumRevision,
  );
  return view;
}
