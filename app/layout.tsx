import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Wordrally — Six guesses. Your rivals.",
  description:
    "A five-letter word game for friends. Make a room, share the code, and race in 1v1, 2v2, free-for-all or Fast Fingers.",
};
// The device keyboard resizes the layout (where supported) so the board can
// stay in view above it; safe-area insets are handled in CSS.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#f6f3e9",
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
