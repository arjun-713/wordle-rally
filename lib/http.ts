import { reportSlowRequest, timedRequest, serverTiming } from "./timing";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { GameError, requireGame } from "./engine";
export async function identity(): Promise<string> {
  const jar = await cookies();
  let token = jar.get("rally-player")?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = randomBytes(32).toString("hex");
    jar.set("rally-player", token, {
      httpOnly: true,
      secure:
        process.env.NODE_ENV === "production" &&
        process.env.ALLOW_LOCAL_STORE !== "true",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365 * 5,
    });
  }
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  // Next's internal request URL can use the bind address (0.0.0.0) instead
  // of the public hostname. Browsers supply the actual destination in Host.
  if (origin) {
    let source: URL;
    try {
      source = new URL(origin);
    } catch {
      throw new GameError("Invalid request origin.", 403);
    }
    const host = request.headers.get("host") ?? new URL(request.url).host;
    const protocol =
      request.headers.get("x-forwarded-proto") ??
      new URL(request.url).protocol.replace(":", "");
    requireGame(
      source.host === host && source.protocol === `${protocol}:`,
      "This request came from another site. Reload and try again.",
      403,
    );
  }
  const declared = request.headers.get("content-length");
  requireGame(
    declared === null || (/^\d+$/.test(declared) && Number(declared) <= 4096),
    "Request is too large.",
    413,
  );
  requireGame(request.body, "Send a valid JSON request.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel().catch(() => {});
        throw new GameError("Request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, position);
    position += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GameError("Send a valid JSON request.");
  }
  requireGame(
    parsed && typeof parsed === "object" && !Array.isArray(parsed),
    "Send a valid request.",
  );
  return parsed;
}
export async function respond(work: () => Promise<unknown>) {
  return timedRequest(() =>
    reply(work).finally(() => reportSlowRequest("API")),
  );
}
async function reply(work: () => Promise<unknown>) {
  try {
    return NextResponse.json(await work(), {
      headers: {
        "Cache-Control": "private, no-store",
        "Server-Timing": serverTiming(),
      },
    });
  } catch (error) {
    if (!(error instanceof GameError))
      console.error(
        "Room request failed",
        error instanceof Error ? error.message : "Unknown error",
      );
    return NextResponse.json(
      {
        ...(error instanceof GameError && error.code
          ? { code: error.code }
          : {}),
        error:
          error instanceof GameError
            ? error.message
            : "Could not reach the room. Please try again.",
      },
      {
        status: error instanceof GameError ? error.status : 503,
        headers: {
          "Cache-Control": "no-store",
          "Server-Timing": serverTiming(),
        },
      },
    );
  }
}
