import type { Metadata } from "next";
import SoloClient from "@/components/solo";
export const metadata: Metadata = {
  title: "Wordle Unlimited — Word Rally",
  description:
    "Play solo five-letter word puzzles at your own pace. Six guesses, no timer, and a new word whenever you finish.",
};
export default function UnlimitedPage() {
  return <SoloClient />;
}
