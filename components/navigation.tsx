"use client";
import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "./shared";
import { PreferencesButton } from "./preferences";
export function TopNav({
  home = false,
  settings,
  children,
}: {
  home?: boolean;
  settings?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="top-nav">
      <Logo />
      <nav aria-label="Main navigation">
        {!home && (
          <Link href="/" className="nav-action mode-link">
            <ArrowLeft size={17} />
            <span>Modes</span>
          </Link>
        )}
        <Link
          href="/stats"
          className="nav-action"
          aria-label="Personal statistics"
          title="Statistics"
        >
          <BarChart3 size={18} />
          <span className="nav-label">Stats</span>
        </Link>
        <PreferencesButton>{settings}</PreferencesButton>
        {children}
      </nav>
    </header>
  );
}
