"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Delete, LoaderCircle } from "lucide-react";
import { isGuessRejection } from "@/lib/client-api";
import { feedback, unlockFeedback } from "./preferences";
import type { Guess, Mark } from "@/lib/types";

type Props = {
  guesses: Guess[];
  playable: boolean;
  busy: boolean;
  onGuess: (word: string) => Promise<boolean>;
  onError: (message: string) => void;
};
export function WordPlay({ guesses, playable, busy, onGuess, onError }: Props) {
  const [input, setInput] = useState("");
  const initialCount = useRef(guesses.length);
  const [rejection, setRejection] = useState("");
  const [rejectionSequence, setRejectionSequence] = useState(0);
  const feedbackId = useId();
  const activeRow = useRef<HTMLDivElement>(null);
  const wiggle = useRef<Animation | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sending = useRef(false);
  useEffect(() => {
    setInput("");
    setRejection("");
    wiggle.current?.cancel();
  }, [guesses.length]);
  useEffect(() => () => wiggle.current?.cancel(), []);
  const previousCount = useRef(guesses.length);
  useEffect(() => {
    if (guesses.length > previousCount.current)
      feedback(
        guesses.at(-1)?.marks.every((m) => m === "correct") ? "win" : "guess",
      );
    previousCount.current = guesses.length;
  }, [guesses]);
  const setError = onError;
  function reject(message = "") {
    feedback("error");
    setRejection(message);
    setRejectionSequence((n) => n + 1);
    wiggle.current?.cancel();
    if (
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      activeRow.current?.animate
    )
      wiggle.current = activeRow.current.animate(
        [0, -6, 6, -5, 5, -2, 2, 0].map((x) => ({
          transform: `translateX(${x}px)`,
        })),
        { duration: 350, easing: "ease-out" },
      );
  }
  function clearRejection() {
    setRejection("");
    wiggle.current?.cancel();
  }
  async function submit() {
    if (!playable || busy || sending.current) return;
    unlockFeedback();
    if (input.length !== 5) {
      reject("Enter a five-letter word.");
      return;
    }
    sending.current = true;
    try {
      if (await onGuess(input.toLowerCase())) {
        setInput("");
      } else {
        reject();
      }
    } catch (error) {
      if (isGuessRejection(error)) reject(error.message);
      else {
        setError(
          error instanceof Error
            ? error.message
            : "Could not check your guess. Please retry.",
        );
        reject();
      }
    } finally {
      sending.current = false;
    }
    if (window.matchMedia("(min-width: 601px)").matches)
      requestAnimationFrame(() => {
        if (!document.querySelector("dialog[open]")) inputRef.current?.focus();
      });
  }
  function keypress(key: string) {
    if (!playable || busy || sending.current) return;
    setError("");
    clearRejection();
    if (key === "ENTER") {
      void submit();
      return;
    }
    if (key === "BACKSPACE") setInput((v) => v.slice(0, -1));
    else if (/^[A-Z]$/.test(key)) setInput((v) => (v + key).slice(0, 5));
  }
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (
        document.querySelector("dialog[open]") ||
        !playable ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      const target = e.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        (target.tagName === "BUTTON" && e.key === "Enter")
      )
        return;
      if (/^[a-z]$/i.test(e.key) || ["Enter", "Backspace"].includes(e.key)) {
        e.preventDefault();
        keypress(e.key.toUpperCase());
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });
  const keyboard: Record<string, Mark> = {};
  const order = { absent: 0, present: 1, correct: 2 };
  for (const guess of guesses)
    guess.word.split("").forEach((letter, i) => {
      const k = letter.toUpperCase();
      if (!keyboard[k] || order[guess.marks[i]] > order[keyboard[k]])
        keyboard[k] = guess.marks[i];
    });
  return (
    <>
      <div
        className="word-board"
        role="table"
        aria-label="Your word board"
        onClick={() =>
          playable &&
          window.matchMedia("(min-width: 601px)").matches &&
          inputRef.current?.focus()
        }
      >
        {Array.from({ length: 6 }, (_, r) => {
          const guess = guesses[r];
          const active = r === (guesses.length ?? 0) && playable;
          return (
            <div
              className={`tile-row ${active && rejection ? "rejected-row" : ""} ${r >= initialCount.current && guess?.marks.every((m) => m === "correct") ? "winning-row" : ""}`}
              ref={active ? activeRow : undefined}
              role="row"
              key={r}
              aria-label={`Guess ${r + 1}${guess ? `: ${guess.word.toUpperCase()}` : active ? ": current guess" : ": empty"}`}
            >
              {Array.from({ length: 5 }, (_, c) => {
                const letter =
                  guess?.word[c]?.toUpperCase() ?? (active ? input[c] : "");
                return (
                  <span
                    role="cell"
                    className={`tile ${guess ? `${r >= initialCount.current ? "revealed" : ""} ${guess.marks[c]}` : letter ? "typed" : ""} ${active ? "current-cell" : ""}`}
                    key={c}
                    style={{ "--cell": c } as React.CSSProperties}
                    aria-label={
                      guess
                        ? `${letter}: ${guess.marks[c] === "correct" ? "correct position" : guess.marks[c] === "present" ? "wrong position" : "absent"}`
                        : letter || "empty"
                    }
                  >
                    {letter}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
      <span
        id={feedbackId}
        className="sr-only guess-feedback"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span key={rejectionSequence}>{rejection}</span>
      </span>
      {playable && (
        <form
          className="mobile-word-entry"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="sr-only" htmlFor="word-input">
            Type your five-letter guess
          </label>
          <input
            id="word-input"
            ref={inputRef}
            value={input}
            disabled={busy}
            aria-invalid={!!rejection}
            aria-describedby={rejection ? feedbackId : undefined}
            onChange={(e) => {
              setInput(
                e.target.value
                  .replace(/[^a-z]/gi, "")
                  .toUpperCase()
                  .slice(0, 5),
              );
              setError("");
              clearRejection();
            }}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={5}
            inputMode="text"
            placeholder="Type a word or use the keys below"
          />
          <button type="submit" disabled={busy} aria-label="Submit guess">
            {busy ? (
              <LoaderCircle size={18} className="spinner" />
            ) : (
              <ArrowRight size={18} />
            )}
          </button>
        </form>
      )}
      <div className="keyboard" role="group" aria-label="On-screen keyboard">
        {["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].map((row, r) => (
          <div className="keyboard-row" key={row}>
            {r === 2 && (
              <button
                className="key wide-key"
                disabled={!playable || busy}
                onClick={() => keypress("ENTER")}
              >
                ENTER
              </button>
            )}
            {row.split("").map((k) => (
              <button
                className={`key ${keyboard[k] ?? ""}`}
                key={k}
                disabled={!playable || busy}
                aria-label={`${k}${keyboard[k] ? `, ${keyboard[k]}` : ""}`}
                onClick={() => keypress(k)}
              >
                {k}
              </button>
            ))}
            {r === 2 && (
              <button
                className="key wide-key"
                aria-label="Delete letter"
                disabled={!playable || busy}
                onClick={() => keypress("BACKSPACE")}
              >
                <Delete size={20} />
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
