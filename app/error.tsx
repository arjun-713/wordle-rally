"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="empty-page">
      <h1>Something went wrong.</h1>
      <p>Your game is saved.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
