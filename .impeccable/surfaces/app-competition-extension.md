---
version: 1
slug: "app-competition-extension"
primary_target: "app/daily/page.tsx"
related_targets: ["components/home.tsx", "components/room.tsx", "components/solo.tsx", "components/stats.tsx", "components/match-results.tsx", "components/preferences.tsx", "app/stats/page.tsx"]
---

# Daily play and the competition scorebook

Mode: Operate. These features extend the existing tabletop arena and the shared board. Inherit DESIGN.md, local Fredoka/Manrope, forest/gold/stone feedback, chalk canvas, and existing responsive controls. No replacement identity, approved comp, or external quality card is part of this scoped code-led extension.

User-confirmed behavior: Classic and Guess bonus 6/5/4/3/2/1 scoring, room championships with the same players or teams and cumulative points, shared titles on ties, round breakdowns, daily challenge, word difficulty, optional sound/haptics and meaningful motion, and personal stats. Spectators, private team discussion, and installable app support are excluded.

Hierarchy: existing room form gains scoring/difficulty/format. Results pair standings with an expandable round ledger. Championship totals are explicitly cumulative and separate from individual match scores. Daily reuses the solo play layout and replaces Next word with Share result and a link to Unlimited. Stats is a scorebook: mode selection, actual summary numbers, six guess bins, and context/recovery links.

Motion: preserve acknowledged tile reveal; a short winning-row celebration is the focal feedback. Saved boards do not animate on reload. Reduced motion removes spatial movement; audio and vibration are opt-in and cannot block play.

Inspect daily playing/won, championship config/results, statistics, and preferences on phone/desktop, plus wide stats. Screenshots use feature- prefixes in .impeccable/review. No marketing metrics or capacity claims are added.

## Final validation evidence

41 rule/service tests pass using the file backend and real Redis Lua over the local REST bridge. Eleven distinct browser flows are validated, including a deterministic delayed old Unlimited sync and later-lobby championship roster lock. Phone, desktop, and wide captures include daily play/results, preferences, room configuration/results, current and empty statistics, error/retry recovery, next-word difficulty, and blocked roster states for host and guest. Detailed acceptance and limitations remain in README.md.
