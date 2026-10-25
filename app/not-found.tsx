import Link from "next/link";
export default function NotFound() {
  return (
    <main className="empty-page">
      <h1>This word went missing.</h1>
      <p>That page doesn’t exist. Start a fresh rivalry from home.</p>
      <Link className="button primary" href="/">
        Back to Word Rally
      </Link>
    </main>
  );
}
