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
        Right spot
      </span>
      <span>
        <i className="present" />
        Wrong spot
      </span>
      <span>
        <i className="absent" />
        Not in word
      </span>
    </div>
  );
}
export function Rules() {
  return (
    <div className="rules">
      <p>Guess the five-letter word in six tries.</p>
      <BoardLegend />
      <h3>With friends</h3>
      <ul>
        <li>Everyone gets the same word on their own board.</li>
        <li>
          Classic: 1 point per solve. Bonus: 6–1 points, fewer guesses = more.
        </li>
        <li>The host starts each round. Tied leaders share the win.</li>
      </ul>
      <h3>Fast Fingers</h3>
      <ul>
        <li>Solve a set of words in any order. Skip and come back.</li>
        <li>
          Score out of 100: half points, half speed. Solve every word to get
          one.
        </li>
        <li>The race ends 60 seconds after the first finisher.</li>
      </ul>
      <h3>Solo</h3>
      <p>
        Unlimited never runs out. Daily is one word for everyone, new at
        midnight UTC.
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
