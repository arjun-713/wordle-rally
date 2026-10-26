import type { Metadata } from "next";
import SoloClient from "@/components/solo";
export const metadata: Metadata = {
  title: "Daily Challenge — Word Rally",
  description:
    "One shared five-letter word every day. Six guesses and saved progress.",
};
export default function DailyPage() {
  return <SoloClient daily />;
}
