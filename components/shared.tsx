"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import Link from "next/link";
export { api } from "@/lib/client-api";

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="Wordrally home">
      wordrally<span aria-hidden="true">.</span>
    </Link>
  );
}
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          close();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not(:disabled), a[href], input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled), [tabindex='0']",
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      aria-labelledby={titleId}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function BoardLegend() {
  return (
    <div className="board-legend" aria-label="Letter feedback guide">
      <span>
        <i className="correct" />
        Correct
      </span>
      <span>
        <i className="present" />
        Elsewhere
      </span>
      <span>
        <i className="absent" />
        Absent
      </span>
    </div>
  );
}
export function Rules() {
  return (
    <div className="rules">
      <p>
        Find the five-letter word in six guesses. Enter submits; Backspace
        deletes.
      </p>
      <BoardLegend />
      <ul>
        <li>
          <strong>Correct:</strong> the right letter in the right place.
        </li>
        <li>
          <strong>Elsewhere:</strong> the letter belongs in another position.
        </li>
        <li>
          <strong>Absent:</strong> no remaining copy of that letter is in the
          word.
        </li>
      </ul>
      <h3>With friends</h3>
      <p>
        Everyone gets the same word and their own board. Classic awards 1 point
        per solve; Guess bonus awards 6–1 points for guesses 1–6. An unsolved
        word earns no points.
      </p>
      <p>
        Using all six guesses ends your turn. Others keep playing. Team scores
        add both players’ points. The host starts and advances rounds; tied
        leaders share the win.
      </p>
      <h3>Solo & daily</h3>
      <p>
        Unlimited offers a new puzzle after each result. Daily gives everyone
        one shared puzzle per UTC day. Neither has a round timer.
      </p>
    </div>
  );
}
export function savedName() {
  try {
    return localStorage.getItem("rally-name") ?? "";
  } catch {
    return "";
  }
}
export function saveName(name: string) {
  try {
    localStorage.setItem("rally-name", name.trim());
  } catch {
    /* Optional persistence. */
  }
}
