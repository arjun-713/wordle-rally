"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { isGuessRejection } from "@/lib/client-api";
import { feedback, unlockFeedback } from "./preferences";
import type { Guess, Mark } from "@/lib/types";

type Props = {
  guesses: Guess[];
  playable: boolean;
  busy: boolean;
  // Show the A–Z tracker of used letters under the board.
  showLetters?: boolean;
  // Keep the device keyboard open when this board is replaced by the next
  // one (Fast Fingers moves to the next word after a solve).
  holdFocus?: boolean;
  // A draft to restore, e.g. when returning to a skipped Fast Fingers word.
  initialInput?: string;
  onDraftChange?: (input: string) => void;
  onGuess: (word: string) => Promise<boolean>;
  onError: (message: string) => void;
};

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const markOrder = { absent: 0, present: 1, correct: 2 };
const markText: Record<Mark, string> = {
  correct: "correct",
  present: "wrong spot",
  absent: "not in word",
};

// iOS only opens the keyboard for a focus inside a user gesture, but it lets
// focus move between inputs while the keyboard is up. When one board is
// swapped for the next, an off-screen input holds focus for the hand-over.
let keeper: HTMLInputElement | null = null;
let keeperTimer: ReturnType<typeof setTimeout> | undefined;
export function holdKeyboard() {
  if (!keeper) {
    keeper = document.createElement("input");
    keeper.className = "keyboard-keeper";
    keeper.tabIndex = -1;
    keeper.setAttribute("aria-hidden", "true");
    keeper.setAttribute("autocomplete", "off");
    keeper.setAttribute("autocapitalize", "characters");
    document.body.append(keeper);
  }
  keeper.focus({ preventScroll: true });
  clearTimeout(keeperTimer);
  keeperTimer = setTimeout(() => keeper?.blur(), 1600);
}
const keeperActive = () => !!keeper && document.activeElement === keeper;

const coarse = () => window.matchMedia("(hover: none)").matches;

export function WordPlay({
  guesses,
  playable,
  busy,
  onGuess,
  onError,
  showLetters = true,
  holdFocus = false,
  initialInput = "",
  onDraftChange,
}: Props) {
  const [input, setInput] = useState(initialInput);
  const [focused, setFocused] = useState(false);
  const acknowledged = useRef(guesses.length);
  const initialCount = useRef(guesses.length);
  const [rejection, setRejection] = useState("");
  const [rejectionSequence, setRejectionSequence] = useState(0);
  const feedbackId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const lettersRef = useRef<HTMLDivElement>(null);
  const activeRow = useRef<HTMLDivElement>(null);
  const wiggle = useRef<Animation | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sending = useRef(false);
  useEffect(() => {
    // Only a newly acknowledged guess clears the row, so a restored draft
    // survives the first render.
    if (acknowledged.current === guesses.length) return;
    acknowledged.current = guesses.length;
    setInput("");
    setRejection("");
    wiggle.current?.cancel();
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

  // Take over a keyboard held open by the previous board; hand it on when
  // this board is replaced.
  const inputMounted = playable || holdFocus;
  useLayoutEffect(() => {
    if (playable && keeperActive())
      inputRef.current?.focus({ preventScroll: true });
  }, [playable]);
  useLayoutEffect(() => {
    // Runs before the board leaves the document, while it still has focus.
    const form = formRef.current;
    return () => {
      if (holdFocus && form?.contains(document.activeElement)) holdKeyboard();
    };
  }, [holdFocus]);
  // A finished board does not keep the keyboard open for long.
  useEffect(() => {
    if (playable || !focused) return;
    const timer = setTimeout(() => inputRef.current?.blur(), 1600);
    return () => clearTimeout(timer);
  }, [playable, focused]);

  useKeyboardViewport(formRef, lettersRef, inputRef, focused);

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
      reject("Five letters needed");
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
            : "Couldn’t check that guess. Try again.",
        );
        reject();
      }
    } finally {
      sending.current = false;
    }
    // Keep typing without another tap: the device keyboard stays up.
    requestAnimationFrame(() => {
      if (!document.querySelector("dialog[open]"))
        inputRef.current?.focus({ preventScroll: true });
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
  // A physical keyboard works without focusing the board first.
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
  const letters: Partial<Record<string, Mark>> = {};
  for (const guess of guesses)
    guess.word.split("").forEach((letter, i) => {
      const k = letter.toUpperCase();
      const known = letters[k];
      if (!known || markOrder[guess.marks[i]] > markOrder[known])
        letters[k] = guess.marks[i];
    });
  const idle = playable && !focused;
  return (
    <>
      <form
        ref={formRef}
        className={`word-grid-form ${idle ? "idle" : ""}`}
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
            if (playable) inputRef.current?.focus({ preventScroll: true });
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
                    guess?.word[col]?.toUpperCase() ??
                    (active ? input[col] : "");
                  return (
                    <span
                      key={col}
                      role="cell"
                      className={`tile ${guess ? `${row >= initialCount.current ? "revealed" : ""} ${guess.marks[col]}` : letter ? "typed" : ""} ${active ? "current-cell" : ""} ${active && col === input.length ? "next-cell" : ""}`}
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
        {inputMounted && (
          // The device keyboard types into this input. Do not reposition the
          // caret on focus: that collapses a programmatic selection (for
          // example select-all then delete).
          <input
            className="grid-input"
            aria-label="Type your five-letter guess"
            ref={inputRef}
            value={input}
            tabIndex={playable ? 0 : -1}
            aria-busy={busy}
            aria-invalid={!!rejection}
            aria-describedby={rejection ? feedbackId : undefined}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(event) => {
              if (event.ctrlKey || event.metaKey || event.altKey) return;
              // Keys with a real value (desktop, iOS) append at the end of
              // the row whatever the caret position; composed input from
              // Android keyboards arrives through onChange instead.
              if (
                /^[a-z]$/i.test(event.key) ||
                ["Enter", "Backspace"].includes(event.key)
              ) {
                event.preventDefault();
                keypress(event.key.toUpperCase());
              }
            }}
            onChange={(event) => {
              if (!playable || busy || sending.current) return;
              setInput(
                event.target.value
                  .replace(/[^a-z]/gi, "")
                  .toUpperCase()
                  .slice(0, 5),
              );
              setError("");
              clearRejection();
            }}
            type="text"
            inputMode="text"
            enterKeyHint="go"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={5}
          />
        )}
      </form>
      <span
        id={feedbackId}
        className="sr-only guess-feedback"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span key={rejectionSequence}>{rejection}</span>
      </span>
      {showLetters && (
        <div className="letter-tracker" ref={lettersRef}>
          {rejection ? (
            <p className="row-message" aria-hidden="true">
              {rejection}
            </p>
          ) : null}
          <ul aria-label="Letters used">
            {ALPHABET.map((letter) => {
              const mark = letters[letter];
              return (
                <li key={letter} className={mark}>
                  {letter}
                  {mark && <span className="sr-only">, {markText[mark]}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

// The tallest visual viewport seen at the current width: the height without
// the keyboard. Shared, so a replacement board knows the keyboard is open.
let tallestView = 0;
let viewWidth = 0;
let tracking = false;
// Installed when the first board mounts, before the keyboard can open.
function trackViewport() {
  const view = window.visualViewport;
  if (!view || tracking) return;
  tracking = true;
  viewWidth = view.width;
  tallestView = view.height;
  view.addEventListener("resize", () => {
    // A new width (rotation) starts a new baseline.
    if (Math.abs(view.width - viewWidth) > 1) {
      viewWidth = view.width;
      tallestView = view.height;
    } else tallestView = Math.max(tallestView, view.height);
  });
}
// When the device keyboard opens, size the board to the space left above it
// and bring it into view: `--view-height` follows the visual viewport, and
// `data-keyboard` on <html> switches on the fitted tile size.
function useKeyboardViewport(
  formRef: React.RefObject<HTMLFormElement | null>,
  lettersRef: React.RefObject<HTMLDivElement | null>,
  inputRef: React.RefObject<HTMLInputElement | null>,
  focused: boolean,
) {
  useEffect(trackViewport, []);
  useEffect(() => {
    const view = window.visualViewport;
    const root = document.documentElement;
    if (!view || !focused || !coarse()) return;
    let frame = 0;
    let aligned = false;
    const align = () => {
      const form = formRef.current;
      if (!form) return;
      const column = form.parentElement;
      // Keep the round clock or status line visible above the board.
      const anchor =
        column?.querySelector<HTMLElement>(
          ":scope > .round-bar:not(.race-bar)",
        ) ??
        column?.querySelector<HTMLElement>(":scope > .game-status") ??
        form;
      const above = Math.max(
        0,
        form.getBoundingClientRect().top - anchor.getBoundingClientRect().top,
      );
      const below = lettersRef.current?.offsetHeight ?? 0;
      root.style.setProperty("--keyboard-reserve", `${above + below + 28}px`);
      requestAnimationFrame(() => {
        const top = anchor.getBoundingClientRect().top;
        window.scrollBy({ top: top - view.offsetTop - 8, behavior: "auto" });
      });
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const open =
          document.activeElement === inputRef.current &&
          tallestView - view.height > 120;
        root.style.setProperty("--view-height", `${Math.round(view.height)}px`);
        root.toggleAttribute("data-keyboard", open);
        if (open && !aligned) align();
        aligned = open;
      });
    };
    update();
    view.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      view.removeEventListener("resize", update);
      root.removeAttribute("data-keyboard");
    };
  }, [focused]);
}
