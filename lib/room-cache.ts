import { requireGame } from "./engine";
import { readRoomCached } from "./store";
import { roomAction, roomSnapshot } from "./service";

// Polls use the shared per-instance room read. `fresh` is for a client that
// just lost a reply and needs the authoritative state before deciding to retry.
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
  if (fresh) return roomAction(code, id);
  const { view } = await roomSnapshot(
    code,
    id,
    () => readRoomCached(code),
    minimumRevision,
  );
  return view;
}
