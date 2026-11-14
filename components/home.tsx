"use client";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, CircleHelp, Hash, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Config, PublicRoom } from "@/lib/types";
import { api, Modal, Rules, savedName, saveName } from "./shared";
import { TopNav } from "./navigation";
import { defaultConfig, finalConfig, RoomConfigFields } from "./room-config";
import { isRetryableActionError, newRequestId } from "@/lib/client-api";

// One request ID for every attempt: if a reply is lost after the room was
// made, the retry returns that room instead of creating a second one.
async function createWithRetry(data: { name: string; config: unknown }) {
  const requestId = newRequestId();
  for (let attempt = 0; ; attempt++) {
    try {
      return await api<PublicRoom>(
        "/api/rooms",
        { ...data, requestId },
        undefined,
        8000,
      );
    } catch (error) {
      if (!isRetryableActionError(error) || attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
}

const preview = [
  {
    word: "PLAYS",
    marks: ["absent", "present", "present", "present", "absent"],
  },
  {
    word: "PARTY",
    marks: ["absent", "correct", "present", "absent", "correct"],
  },
  {
    word: "RALLY",
    marks: ["correct", "correct", "correct", "correct", "correct"],
  },
];
export default function Home() {
  const router = useRouter();
  const [panel, setPanel] = useState<"create" | "join" | "rules" | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [config, setConfig] = useState<Config>(defaultConfig),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setName(savedName());
    // Wake the room-creation function while the player reads the page, so
    // "Create room" doesn't wait on a cold start. It touches no storage.
    void fetch("/api/rooms", { cache: "no-store" }).catch(() => {});
  }, []);
  function open(next: typeof panel) {
    setError("");
    setPanel(next);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (!name.trim()) {
      setError("Add your name first.");
      return;
    }
    setBusy(true);
    try {
      saveName(name);
      const room =
        panel === "create"
          ? await createWithRetry({ name, config: finalConfig(config) })
          : await api<PublicRoom>(`/api/rooms/${code.toUpperCase()}`, {
              action: "join",
              name,
            });
      router.push(`/room/${room.code}`);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell home-shell">
      <TopNav
        home
        settings={
          <label className="setting-field">
            Your name
            <input
              autoComplete="nickname"
              maxLength={20}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                saveName(event.target.value);
              }}
            />
          </label>
        }
      />
      <main className="home-hub">
        <section className="hub-copy" aria-labelledby="home-title">
          <h1 id="home-title">
            Your word.
            <br />
            Against theirs.
          </h1>
          <p>Same word. Six guesses. Who gets it first?</p>
          <div className="hub-actions">
            <button className="button primary" onClick={() => open("create")}>
              <Plus size={19} />
              Create a room
              <ArrowRight size={19} />
            </button>
            <button className="button secondary" onClick={() => open("join")}>
              <Hash size={18} />
              Join with code
            </button>
          </div>
          <div className="hub-solo">
            <Link href="/unlimited" aria-label="Play Wordle Unlimited">
              Play solo
              <ArrowUpRight size={17} />
            </Link>
            <Link href="/daily">
              Daily
              <ArrowUpRight size={17} />
            </Link>
            <button onClick={() => open("rules")}>
              <CircleHelp size={17} />
              How to play
            </button>
          </div>
          <p className="hub-formats">
            1 vs 1 · 2 vs 2 · 1 vs all · Fast Fingers
          </p>
        </section>
        <section
          className="match-preview"
          aria-label="Illustrative match preview"
          data-ui
        >
          <div className="preview-heading">
            <h2>Match preview</h2>
            <span>Round 2 / 5</span>
          </div>
          <div className="preview-score">
            <span>
              You
              <strong>
                3 <small>pts</small>
              </strong>
            </span>
            <span className="preview-clock">01:28</span>
            <span>
              Rival
              <strong>
                2 <small>pts</small>
              </strong>
            </span>
          </div>
          <div
            className="preview-grid"
            aria-label="Example board, RALLY solved in three guesses"
          >
            {Array.from({ length: 6 }, (_, row) => (
              <div className="tile-row" key={row}>
                {Array.from({ length: 5 }, (_, col) => (
                  <span
                    key={col}
                    className={`tile ${preview[row]?.marks[col] ?? ""}`}
                  >
                    {preview[row]?.word[col] ?? ""}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>
      </main>
      {panel && (
        <Modal
          title={
            panel === "rules"
              ? "How to play"
              : panel === "create"
                ? "Create a room"
                : "Join a room"
          }
          close={() => !busy && setPanel(null)}
          wide={panel === "create"}
        >
          {panel === "rules" ? (
            <Rules />
          ) : (
            <form onSubmit={submit} className="setup-form">
              <label>
                Your name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={20}
                  autoComplete="nickname"
                  required
                />
              </label>
              {panel === "join" ? (
                <label>
                  Room code
                  <input
                    className="code-input"
                    value={code}
                    onChange={(event) =>
                      setCode(
                        event.target.value
                          .replace(/[^a-zA-Z2-9]/g, "")
                          .toUpperCase(),
                      )
                    }
                    minLength={6}
                    maxLength={6}
                    autoComplete="off"
                    placeholder="6 characters"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                  />
                </label>
              ) : (
                <RoomConfigFields value={config} onChange={setConfig} />
              )}
              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
              <button className="button primary full" disabled={busy}>
                {busy
                  ? "Opening…"
                  : panel === "create"
                    ? "Create room"
                    : "Join room"}
                <ArrowRight size={18} />
              </button>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
