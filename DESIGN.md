---
name: Word Rally
description: A tactile tabletop word arena for friendly competition.
colors:
  canvas: "#f5f6f2"
  paper: "#fff"
  ink: "#24352d"
  muted: "#58675c"
  line: "#dce2d8"
  green: "#426c48"
  green-dark: "#315637"
  mint: "#e3eddd"
  gold: "#957121"
  yellow: "#f8edca"
  stone: "#6b746d"
  key: "#e7ebe3"
  key-hover: "#cfdac5"
  control-line: "#cbd3c8"
  field-line: "#c6d0c0"
  tile-line: "#d3dccc"
  tile-typed: "#879a7c"
  mode-selected: "#edf2e6"
  mode-selected-line: "#9bad8c"
  mode-hover: "#eef2e9"
  mode-hover-line: "#aebfa6"
  segment: "#e9eee3"
  segment-line: "#d6dece"
  tag-line: "#d1dac9"
  error-bg: "#f9e8df"
  error-ink: "#874226"
  error-line: "#ebc8b7"
typography:
  display:
    fontFamily: "Fredoka, sans-serif"
    fontSize: "clamp(56px, 5.6vw, 86px)"
    fontWeight: 500
    lineHeight: 1.03
    letterSpacing: "-2.5px"
  headline:
    fontFamily: "Fredoka, sans-serif"
    fontSize: "40px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-1px"
  title:
    fontFamily: "Fredoka, sans-serif"
    fontSize: "23px"
    fontWeight: 500
    lineHeight: 1.15
  body:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.6
  label:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 800
    lineHeight: 1.6
  action:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 800
    lineHeight: 1.5
  letter:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "29px"
    fontWeight: 800
    lineHeight: 1
rounded:
  tile: "4px"
  key: "5px"
  inset: "8px"
  field: "10px"
  control: "12px"
  panel-mobile: "16px"
  preview: "18px"
  panel: "20px"
  circle: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  section: "24px"
  panel: "32px"
  section-large: "40px"
  wide: "48px"
  spacious: "64px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.paper}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "12px 22px"
  button-primary-hover:
    backgroundColor: "{colors.green-dark}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "12px 22px"
  button-secondary-hover:
    backgroundColor: "{colors.mint}"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "12px 14px"
  navigation:
    textColor: "{colors.ink}"
    padding: "10px 4px"
  tag:
    textColor: "{colors.muted}"
    rounded: "{rounded.tile}"
    padding: "1px 5px"
  mode-card:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "24px 18px"
  mode-card-selected:
    backgroundColor: "{colors.mode-selected}"
  segmented:
    backgroundColor: "{colors.segment}"
    rounded: "{rounded.control}"
    padding: "5px"
  segmented-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.green}"
    rounded: "{rounded.inset}"
  tile:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.letter}"
    rounded: "{rounded.tile}"
  tile-correct:
    backgroundColor: "{colors.green}"
    textColor: "{colors.paper}"
  tile-present:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.paper}"
  tile-absent:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.paper}"
  keyboard-key:
    backgroundColor: "{colors.key}"
    textColor: "{colors.ink}"
    rounded: "{rounded.key}"
    height: "46px"
  room-panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "32px"
---

# Design System: Word Rally

## Overview

**Creative North Star: “The tabletop word arena.”**

Word Rally feels like friends gathering around a well-made word game: chalk-white paper, forest-green pieces, mustard-gold feedback, rounded lettering, and precise five-column grids. The material comes from the game itself. Letters, score slips, and softly lifted pieces provide the character.

The same world becomes quieter around live play. Reading, entering a guess, seeing the remaining time, and comparing scores take priority over decoration. This document records the implemented reusable system. Route modes, narrative order, preview composition, and the development direction contract belong in `.impeccable/surfaces/app-page-tsx.md`.

**Key Characteristics:**

- Rounded display lettering paired with compact, clear operational type.
- Stable semantic letter colors shared by boards and keyboards.
- Tonal paper surfaces with thin separators and selective soft lift.
- Responsive density that keeps the board and touch keyboard together.

## Colors

A muted green paper palette carries the interface; mustard gold marks partial success and stone marks exhausted letters. The frontmatter is normative for all color values.

### Primary

- **Forest Green** (`green`): primary actions, correct letters, positive scores, and the timer. **Deep Forest** (`green-dark`) supplies the primary hover state and its short shadow.
- **Pale Mint** (`mint`): the current player's row, room-code surfaces, supportive notes, and secondary-action hover.

### Secondary

- **Mustard Gold** (`gold`): letters present in another position, related key states, and the general keyboard focus outline. **Pale Yellow** (`yellow`) supports trophies and warm notices.

### Neutral

- **Chalk Canvas** (`canvas`) and **White Paper** (`paper`): the page and its focused working surfaces.
- **Deep Ink** (`ink`) and **Quiet Green Ink** (`muted`): primary reading and supporting text.
- **Stone** (`stone`): absent letters on boards and keyboards; it is a feedback color, not a disabled-state substitute.
- **Paper Line** (`line`): broad separators and room-panel borders. Control, field, and tile strokes have their own extracted tokens.
- **Key Paper** (`key`, `key-hover`), selected-mode colors, and segmented-control colors make interaction states legible without introducing a new accent.
- Error background, ink, and border form a distinct warm error treatment, separate from word feedback.

**The Shared Feedback Rule.** Correct, present, and absent states keep the same meaning on the board, keyboard, and legend. Retain written descriptions and accessible letter-state names alongside color.

## Typography

**Display Font:** Fredoka, falling back to sans-serif. The locally hosted variable TrueType asset is `/fonts/fredoka.ttf` with a declared weight range of 300–700.

**Body Font:** Manrope, with Arial and sans-serif fallbacks. The locally hosted variable TrueType asset is `/fonts/manrope.ttf` with a declared weight range of 200–800. Both faces use `font-display: swap`.

The display face supplies friendly rounded character; Manrope keeps names, controls, explanations, timers, and letter grids precise. The implementation uses no separate mono face. Timers, ranks, and scores use tabular numerals where stability matters.

### Hierarchy

- **Display:** the fluid frontmatter role is the desktop invitation. Tablet uses `clamp(55px, 9.5vw, 78px)`; phones use `clamp(49px, 12.5vw, 70px)`, with a looser line height (1.07) and tracking (−1.5px).
- **Headline:** room headings use the headline role. Phones reduce them to (32px), and active play to (26px). Results also use a large rounded heading.
- **Title:** panel titles use the title role; section and dialog titles are larger (29px), with a phone dialog variant (26px).
- **Body:** the base is the frontmatter body role. Supporting room descriptions generally use (12px). Landing explanatory text uses (15px), reducing to (14px) on phones.
- **Label and action:** labels are strong and compact, with (8px) between a label and its field. Buttons use the action role. Inputs and selects use readable text (16px, weight 600).
- **Letters:** the board uses the letter role; active phone play uses (24px). Keyboard letters use (12px, weight 800); Enter is smaller to fit its wider key.

**The Two Voices Rule.** Use Fredoka for identity and headings; use Manrope for operational information and game characters. Preserve the heavier weight of letter tiles and keys.

## Layout

The shared shell caps its width at (1800px) and uses fluid side padding, `clamp(24px, 5.2vw, 100px)`, with fixed phone gutters (24px). The reusable spacing vocabulary is in the frontmatter; grid and board gaps also use compact (5–6px) intervals when the character matrix needs them.

Main room layouts pair a flexible working area with a supporting rail (330px), separated by (32px). The rail becomes (280px) at widths up to (1150px), and (400px) from (1700px). Game and results layouts stack at widths up to (850px); the lobby retains its narrower invite rail until the phone breakpoint (600px). On phones, the lobby stacks and standings become a single list.

Phone active play has a specific density variant: a shorter header (64px), compact title and room-code area, reduced panel padding, a board width (240px), and the touch keyboard directly below. The six-row board, timer, and keyboard fit the reviewed (390 × 844px) active-play viewport; standings continue below. This is evidence for that viewport, not a guarantee for every browser height. The duplicate text-entry form is visually clipped in this variant while the visible keyboard remains the primary touch input.

The default board width is `min(100%, 310px)`, widening to (340px) on large desktops. Each row always has five equal columns. The keyboard caps at (490px); letter keys flex evenly while Enter and Delete are wider. Preserve these relationships when adding adjacent content.

## Elevation & Depth

Most working surfaces rely on white paper, muted tints, thin borders, and whitespace. Selective soft shadows give primary actions, illustrative pieces, and modal dialogs physical presence. Active game tiles stay flat so a grid remains stable and easy to scan. Decorative rotation belongs to illustrative pieces and the logo; operational boards remain aligned.

### Shadow Vocabulary

Exact values are recorded in the sidecar: **Action lift** is short and softly blurred; **Preview paper** is a larger diffuse shadow; **Score slip** adds light layered depth; **Modal elevation** separates the focused dialog from its blurred backdrop; **Segment selection** lightly lifts the selected option. These are not hard offset edges.

The general focus treatment is a visible gold outline (3px, offset 4px). Focused fields instead use a forest outline (2px, offset 1px). Keep focus visible across all color variants.

## Shapes

Small squares define letters: play tiles have gently rounded corners and a two-pixel outline. Controls use a broader curve; fields are slightly tighter. Room panels and dialogs use the panel radius, reducing to the phone panel radius on small screens. The illustrative preview has its own middle radius. Avatars and trophy medallions are circles.

Thin lines divide sections and frame working panels. Empty player slots use dashed outlines. These are functional distinctions; do not give every region the same card treatment.

## Components

### Buttons

Primary actions are confident forest pieces with white, heavy text and a soft short shadow. Secondary actions are transparent with a muted stroke. Both use the shared control radius, internal padding from the frontmatter, an inline icon gap (10px), and a minimum height (52px); landing actions reduce to (48px) on phones.

Hover darkens a primary action or fills a secondary action with mint. Press shifts enabled buttons down (2px). State transitions last (140ms). Disabled buttons lower opacity (0.5) and use a disabled cursor. Do not extend this opacity to normal supporting text.

### Chips

Mode labels are small static outlined tags, with compact padding and the tile radius. They supplement the mode name; selection belongs to the encompassing mode card, not the tag.

### Cards / Containers

Room panels use white paper, a thin paper-line border, and the panel radius. Their padding follows content density: lobby (32px), game (24px 32px 28px), and results (40px), with tighter phone variants.

Mode choices are interactive cards with the control radius and a selection marker. Hover uses the mode-hover tint and stroke. Selection uses the mode-selected tint and stroke plus a filled forest check marker. Preserve the card's actual button semantics and `aria-pressed` state.

### Inputs / Fields

Fields use white paper, a field-line stroke, the field radius, and frontmatter padding. Minimum height is (48px); visible labels remain above the controls. Room-code entry is uppercase with expanded tracking. Errors appear in the warm error treatment with explicit text. Disabled selects have a muted fill and disabled cursor.

Segmented choices sit in a softly tinted outlined tray. The selected option is white with forest text and a small shadow. Keep the `fieldset` and `legend` relationship and the selected button's accessible state.

### Navigation

The wordmark combines small tilted letter pieces with rounded lettering. Navigation is compact Manrope text with inline SVG icons; text actions have a minimum height (44px), green hover color, and underlining. Phone room navigation retains the accessible labels while showing icon-only actions with a minimum width (44px).

### Word board and keyboard

The board is a precise five-column, six-attempt matrix. Empty cells are white and outlined; typed cells strengthen their outline. Acknowledged cells use the shared feedback colors with white, heavy letters. The single reveal lasts (320ms), staggered (55ms) per cell. Text descriptions expose letter state to assistive technology.

Rejected guesses wiggle only the active row for (350ms), retaining the typed word and marking its outlines with `error-ink` until editing resumes. Dictionary and duplicate-word rejections use this board feedback with a screen-reader announcement rather than a separate alert panel. Reduced motion retains the outline and announcement without movement. A pending guess announces that it is being checked; lost replies trigger a bounded check of the saved puzzle before a retry is offered.

The three-row keyboard uses pale keys, equal flexible letters, and wider Enter/Delete controls. Keys are (46px) high; feedback colors follow the board. Preserve the visible text legend and status announcements. Supporting standings highlight the current player with mint and pair numbers with names and textual solve status.

The illustrative board entrance lasts (700ms) with the shared easing curve. Reduced-motion preferences remove CSS animations and transitions and remove the main action's press transform. These motion details are recorded in the sidecar rather than frontmatter.

## Do's and Don'ts

### Do:

- **Do** preserve shared letter-state meaning across tiles, keys, accessible names, and the legend.
- **Do** use the local Fredoka and Manrope assets with their declared variable weight ranges.
- **Do** keep important actions, timer, board, and touch keyboard legible when changing phone layouts.
- **Do** reserve shadows for the existing material roles and keep operational letter grids aligned.
- **Do** pair color feedback with text and visible focus, and honor reduced-motion preferences.

### Don't:

- **Don't** replace absent-letter stone with a low-contrast decorative gray or lighten gold behind white letter text.
- **Don't** promote preview scores, players, or timestamps into claims about actual room activity.
- **Don't** copy decorative board rotation onto the playable matrix.
- **Don't** turn this document into a route-composition plan or expose the development direction contract in the interface.
