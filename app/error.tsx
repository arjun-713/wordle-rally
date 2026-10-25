"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="empty-page">
      <h1>A little timeout.</h1>
      <p>We couldn’t load this page. Your room may still be waiting.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
