"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import type { ChatMessage, PublicRoom } from "@/lib/types";

const MAX_LENGTH = 160; // matches CHAT_MAX_LENGTH on the server

function seenKey(code: string) {
  return `rally-chat-seen:${code}`;
}
function readSeen(code: string): number {
  try {
    return Number(sessionStorage.getItem(seenKey(code))) || 0;
  } catch {
    return 0;
  }
}
function writeSeen(code: string, at: number) {
  try {
    sessionStorage.setItem(seenKey(code), String(at));
  } catch {}
}

// Room chat for players and spectators. Messages arrive with the room polls
// that already run; sending is one request and never blocks a guess.
export function RoomChat({
  room,
  onSend,
}: {
  room: PublicRoom;
  onSend: (text: string) => Promise<string | null>;
}) {
  const messages = room.chat ?? [];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  // Newest message time already seen. Messages before this screen opened
  // count as seen, so a reload doesn't flood the badge.
  const [seenAt, setSeenAt] = useState(() => {
    const stored = readSeen(room.code);
    return stored || (messages.at(-1)?.at ?? 0);
  });
  const [toast, setToast] = useState<ChatMessage | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const latest = messages.at(-1);
  const unread = messages.filter(
    (m) => m.at > seenAt && m.from !== room.me,
  ).length;

  // Opening the panel, or a new message while it's open, marks all as seen.
  useEffect(() => {
    if (!open || !latest) return;
    setSeenAt(latest.at);
    writeSeen(room.code, latest.at);
  }, [open, latest?.id]);

  // A brief preview of someone else's new message while the panel is closed.
  const previewed = useRef(latest?.id);
  useEffect(() => {
    if (!latest || latest.id === previewed.current) return;
    previewed.current = latest.id;
    if (open || latest.from === room.me || latest.at <= seenAt) return;
    setToast(latest);
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [latest?.id]);

  // Keep the newest message in view.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (open && list) list.scrollTop = list.scrollHeight;
  }, [open, messages.length]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus({ preventScroll: true });
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    const problem = await onSend(text);
    setSending(false);
    if (problem) setError(problem);
    else setDraft("");
    inputRef.current?.focus();
  }

  const nameOf = (m: ChatMessage) =>
    m.from === room.me ? "You" : `${m.name}${m.spectator ? " · watching" : ""}`;
  const time = (at: number) =>
    new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <>
      <button
        className="icon-button chat-toggle"
        aria-label={unread ? `Chat, ${unread} unread` : "Chat"}
        aria-expanded={open}
        aria-controls="room-chat"
        title="Chat"
        onClick={() => {
          setOpen((value) => !value);
          setToast(null);
        }}
      >
        <MessageCircle size={19} />
        {unread > 0 && (
          <span className="chat-badge" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {toast && !open && (
        <button
          className="chat-toast"
          onClick={() => {
            setOpen(true);
            setToast(null);
          }}
        >
          <MessageCircle size={15} aria-hidden="true" />
          <strong>{toast.name}</strong>
          <span>{toast.text}</span>
        </button>
      )}
      {open && (
        <section id="room-chat" className="chat-panel" aria-label="Room chat">
          <header>
            <h2>Chat</h2>
            <button
              className="icon-button"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          <ol
            ref={listRef}
            className="chat-messages"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.length === 0 && (
              <li className="chat-empty">Say hi to the room.</li>
            )}
            {messages.map((m) => (
              <li
                key={m.id}
                className={`chat-message ${m.from === room.me ? "mine" : ""}`}
              >
                <span className="chat-meta">
                  <strong>{nameOf(m)}</strong>
                  <time dateTime={new Date(m.at).toISOString()}>
                    {time(m.at)}
                  </time>
                </span>
                <p>{m.text}</p>
              </li>
            ))}
          </ol>
          {error && (
            <p className="chat-error" role="alert">
              {error}
            </p>
          )}
          <form className="chat-form" onSubmit={send}>
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value.slice(0, MAX_LENGTH));
                setError("");
              }}
              maxLength={MAX_LENGTH}
              placeholder="Message"
              aria-label="Chat message"
              autoComplete="off"
              enterKeyHint="send"
            />
            <button
              className="button primary chat-send"
              disabled={!draft.trim() || sending}
              aria-label="Send message"
            >
              <Send size={17} />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
