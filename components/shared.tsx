"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUpRight, X } from "lucide-react";
import Link from "next/link";
export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="Word Rally home">
      <span className="logo-tiles" aria-hidden="true">
        <i>W</i>
        <i>R</i>
      </span>
      <span>
        word<span className="logo-light">rally</span>
        <span className="logo-dot">.</span>
      </span>
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
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="modal-head">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Rules() {
  return (
    <div className="rules">
      <p>One five-letter word. Six guesses. A room full of rivals.</p>
      <div className="example-tiles">
        <span className="tile correct">W</span>
        <span className="tile present">O</span>
        <span className="tile absent">R</span>
        <span className="tile">D</span>
        <span className="tile">S</span>
      </div>
      <ul>
        <li>
          <strong>Green:</strong> right letter, right place.
        </li>
        <li>
          <strong>Yellow:</strong> right letter, different place.
        </li>
        <li>
          <strong>Gray:</strong> that letter is not available in the answer.
        </li>
      </ul>
      <p>
        Everyone gets the same word and their own six attempts. Every solve
        earns <strong>1 point in Classic</strong>. Guess bonus scoring awards{" "}
        <strong>6, 5, 4, 3, 2, or 1 points</strong> for solving in guesses 1
        through 6. Timed rooms have a shared deadline; untimed rooms let
        everyone use their six guesses at their own pace. Used all your guesses?
        Others can still finish.
      </p>
      <p>
        In 2v2, your individual points add to your team total. In free-for-all,
        every player competes individually. Ties are shared wins.
      </p>
      <p>
        The host starts each round. No one solves? No one scores. Championships
        add points across several matches with the same players or teams.
      </p>
    </div>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <span>Five letters. Unlimited bragging rights.</span>
      <a
        href="https://github.com/dwyl/english-words"
        target="_blank"
        rel="noreferrer"
      >
        Dictionary source <ArrowUpRight size={13} />
      </a>
      <span>Made for a little friendly rivalry.</span>
    </footer>
  );
}
export async function api<T>(
  url: string,
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: data ? "POST" : "GET",
    ...(data
      ? {
          body: JSON.stringify(data),
          headers: { "Content-Type": "application/json" },
        }
      : {}),
    cache: "no-store",
    signal,
  });
  const json = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(json.error ?? "Something went wrong. Please try again."),
      { status: response.status },
    );
  return json;
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
    /* The room still works when name persistence is blocked. */
  }
}
