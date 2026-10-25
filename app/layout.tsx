import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Word Rally — Good words. Great rivals.",
  description:
    "Challenge your friends to a round-based word game. Create a private room, share the code, and play 1v1, 2v2, or free-for-all.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
