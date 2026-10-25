import type { Metadata } from "next";
import StatsClient from "@/components/stats";
export const metadata: Metadata = {
  title: "Personal Statistics — Word Rally",
  description:
    "Your Word Rally solve rates, streaks, guess distribution, and multiplayer results.",
};
export default function StatsPage() {
  return <StatsClient />;
}
