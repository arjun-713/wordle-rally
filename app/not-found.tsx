import Link from "next/link";
export default function NotFound() {
  return (
    <main className="empty-page">
      <h1>This word went missing.</h1>
      <Link className="button primary" href="/">
        Go home
      </Link>
    </main>
  );
}
