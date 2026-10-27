"use client";
import { useEffect, useId, useRef, useState } from "react";
import acceptedWords from "@/data/guesses.json";
import { Delete } from "lucide-react";
import { isGuessRejection } from "@/lib/client-api";
import { feedback, unlockFeedback } from "./preferences";
import type { Guess, Mark } from "@/lib/types";

const validWords = new Set(acceptedWords);

type Props = {
  guesses: Guess[];
  playable: boolean;
  busy: boolean;
  showKeyboard?: boolean;
  initialInput?: string;
  onDraftChange?: (input: string) => void;
  onGuess: (word: string) => Promise<boolean>;
  onError: (message: string) => void;
  // Optional content shown beside the board (e.g. a rival's ghost board).
  aside?: React.ReactNode;
};
export function WordPlay({
  guesses,
  playable,
  busy,
  onGuess,
  onError,
  showKeyboard = true,
  initialInput = "",
  onDraftChange,
  aside,
}: Props) {
  const [input, setInput] = useState(initialInput);
  const acknowledged = useRef(guesses.length);
  const initialCount = useRef(guesses.length);
  const [rejection, setRejection] = useState("");
  const [rejectionSequence, setRejectionSequence] = useState(0);
  const feedbackId = useId();
  const activeRow = useRef<HTMLDivElement>(null);
  const wiggle = useRef<Animation | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sending = useRef(false);
  useEffect(() => {
    if (acknowledged.current !== guesses.length) {
      setInput("");
      setRejection("");
      wiggle.current?.cancel();
    }
    acknowledged.current = guesses.length;
  }, [guesses.length]);
  useEffect(() => {
    onDraftChange?.(input);
  }, [input]);
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
        { duration: 240, easing: "ease-out" },
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
    const word = input.toLowerCase();
    if (!validWords.has(word)) {
      reject(
        "That word is not in the dictionary. Try another five-letter word.",
      );
      return;
    }
    if (guesses.some((guess) => guess.word === word)) {
      reject("You already tried that word.");
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
        target.isContentEditable ||
        (["BUTTON", "A", "SUMMARY"].includes(target.tagName) &&
          e.key === "Enter")
      )
        return;
      if (/^[a-z]$/i.test(e.key) || ["Enter", "Backspace"].includes(e.key)) {
        e.preventDefault();
        if (e.key !== "Enter") inputRef.current?.focus({ preventScroll: true });
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
  const board = (
    <form
      className="word-grid-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      style={{ "--active-row": guesses.length } as React.CSSProperties}
    >
      <div
        className="word-board"
        role="table"
        aria-label="Your word board"
        onClick={() => {
          if (playable && window.matchMedia("(min-width: 601px)").matches)
            inputRef.current?.focus();
        }}
      >
        {Array.from({ length: 6 }, (_, row) => {
          const guess = guesses[row],
            active = row === guesses.length && playable;
          return (
            <div
              key={row}
              ref={active ? activeRow : undefined}
              role="row"
              className={`tile-row ${active ? "current-row" : ""} ${active && rejection ? "rejected-row" : ""} ${row >= initialCount.current && guess?.marks.every((mark) => mark === "correct") ? "winning-row" : ""}`}
              aria-label={`Guess ${row + 1}${guess ? `: ${guess.word.toUpperCase()}` : active ? ": current guess" : ": empty"}`}
            >
              {Array.from({ length: 5 }, (_, col) => {
                const letter =
                  guess?.word[col]?.toUpperCase() ?? (active ? input[col] : "");
                return (
                  <span
                    key={col}
                    role="cell"
                    className={`tile ${guess ? `${row >= initialCount.current ? "revealed" : ""} ${guess.marks[col]}` : letter ? "typed" : ""} ${active ? "current-cell" : ""}`}
                    style={{ "--cell": col } as React.CSSProperties}
                    aria-label={
                      guess
                        ? `${letter}: ${guess.marks[col] === "correct" ? "correct position" : guess.marks[col] === "present" ? "wrong position" : "absent"}`
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
      {playable && (
        <input
          className="grid-input"
          aria-label="Type your five-letter guess"
          ref={inputRef}
          value={input}
          disabled={busy}
          aria-invalid={!!rejection}
          aria-describedby={rejection ? feedbackId : undefined}
          onFocus={(event) =>
            event.currentTarget.setSelectionRange(input.length, input.length)
          }
          onKeyDown={(event) => {
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (
              /^[a-z]$/i.test(event.key) ||
              ["Enter", "Backspace"].includes(event.key)
            ) {
              event.preventDefault();
              keypress(event.key.toUpperCase());
            }
          }}
          onChange={(event) => {
            setInput(
              event.target.value
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
        />
      )}
    </form>
  );
  return (
    <>
      {aside ? (
        <div className="board-frame">
          {board}
          <div className="board-aside">{aside}</div>
        </div>
      ) : (
        board
      )}
      <span
        id={feedbackId}
        className="sr-only guess-feedback"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span key={rejectionSequence}>{rejection}</span>
      </span>
      {showKeyboard && (
        <VirtualKeyboard
          letters={keyboard}
          disabled={!playable || busy}
          onKey={keypress}
        />
      )}
    </>
  );
}

export function VirtualKeyboard({
  letters,
  disabled,
  onKey,
}: {
  letters: Record<string, Mark>;
  disabled: boolean;
  onKey: (key: string) => void;
}) {
  return (
    <div className="keyboard" role="group" aria-label="On-screen keyboard">
      {["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].map((row, index) => (
        <div className="keyboard-row" key={row}>
          {index === 2 && (
            <button
              className="key wide-key"
              aria-label="Submit guess"
              disabled={disabled}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onKey("ENTER")}
            >
              Enter
            </button>
          )}
          {row.split("").map((key) => (
            <button
              key={key}
              className={`key ${letters[key] ?? ""}`}
              disabled={disabled}
              aria-label={`${key}${letters[key] ? `, ${letters[key]}` : ""}`}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onKey(key)}
            >
              {key}
            </button>
          ))}
          {index === 2 && (
            <button
              className="key wide-key"
              aria-label="Delete letter"
              disabled={disabled}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onKey("BACKSPACE")}
            >
              <Delete size={19} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
