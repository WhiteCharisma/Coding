# Design system

The visual identity of Creator Network: what it should feel like, the tokens that implement it,
and the rules components follow. Tokens live in `apps/web/src/styles/tokens.css` and are exposed
to Tailwind utilities in `apps/web/src/app.css`. Components never use raw colours, ad-hoc
spacing scales or one-off durations.

## Direction

**"A dimly lit studio."** Warm charcoal and graphite surfaces, like a control room at night, with
one accent — **signal amber**, the glow of a VU meter or a tube amp. The interface is a quiet,
professional tool: content (people's work and conversations) is the brightest thing on screen;
chrome stays in the background.

- One accent colour. Amber marks the primary action, the current selection, unread state and
  mentions — never decoration.
- Hierarchy through surface levels and type, not through borders and boxes.
- Dark first; a full light theme ("daylight studio", warm paper tones) uses the same tokens.
- Motion is short and purposeful (state changes, entering/leaving), never ambient.
- Original artwork only: the logo, the auth-page meter and waveform art, the welcome-page
  composition and the demo images/audio are generated in this repository.

## Colour tokens

Colours are defined in OKLCH so lightness steps are perceptually even.

| Group    | Tokens                                                                                     | Use                                                                                           |
| -------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Surfaces | `--bg-app` → `--bg-rail` → `--bg-sidebar` → `--bg-main` → `--bg-elevated` → `--bg-overlay` | Each level is slightly lighter (dark theme). `--bg-inset` for wells (inputs, code, waveforms) |
| States   | `--bg-hover`, `--bg-active`, `--bg-selected`, `--scrim`                                    | Translucent overlays so they work on any surface                                              |
| Borders  | `--border-subtle`, `--border`, `--border-strong`                                           | Hairlines; prefer spacing and surface changes over borders                                    |
| Text     | `--text`, `--text-2`, `--text-muted`, `--text-faint`                                       | `--text-faint` only for large or decorative text (below 4.5:1)                                |
| Accent   | `--accent`, `-hover`, `-press`, `-fg`, `-text`, `-soft`, `-border`                         | `--accent-text` is the readable variant for amber text on dark surfaces                       |
| Semantic | `--success`, `--warning`, `--danger`, `--info` (+ `-soft`; `--danger-fg`, `--success-fg`)  | Status only; `-fg` is the text colour on a solid fill (dark on dark theme, white on light)    |
| Presence | `--presence-online/idle/dnd/offline`                                                       | Always paired with a distinct shape (see Accessibility)                                       |
| Messages | `--mention-bg`, `--mention-bar`, `--code-bg`                                               | Mentions of you get a soft amber wash and a left bar                                          |
| Focus    | `--ring`                                                                                   | 2 px outline, 2 px offset on `:focus-visible`                                                 |

Tailwind names map to tokens: `bg-main`, `bg-elevated`, `text-fg`, `text-fg-muted`,
`border-line`, `bg-accent`, `text-accent-text`, `bg-danger-soft`, …

## Typography

| Role             | Font (self-hosted, variable) | Notes                                                       |
| ---------------- | ---------------------------- | ----------------------------------------------------------- |
| Interface        | Inter                        | 14 px (`text-ui`) for chrome, `cv11`/`ss01`/`ss03` features |
| Conversation     | Inter                        | 15 px (`text-base`) with 1.45 line height for messages      |
| Display/headings | Bricolage Grotesque          | Page titles, onboarding, welcome page                       |
| Code, durations  | JetBrains Mono               | Inline code, code blocks, audio timestamps                  |

The type scale (`text-2xs` 11 px … `text-5xl` 54 px) is defined in `app.css`. Fonts are bundled
with the app (no external font CDN) and split by script so browsers download only what a page
needs.

## Shape, depth and layout

- Radius: `xs` 4 · `sm` 6 · `md` 8 (buttons, inputs) · `lg` 12 (cards, popovers) · `xl` 16 ·
  `2xl` 22 (dialogs, community icons).
- Shadows: `--shadow-sm/md/lg` for elevation, `--shadow-glow` (amber hairline) for the focused or
  featured element. Shadows are heavier in the dark theme to stay visible.
- Desktop shell (≥ 768 px): community rail (72 px) · sidebar (264 px) · main column · header
  52 px. The context panel (members or pins, 300 px) is docked from 1280 px and slides in as a
  sheet on narrower screens.
- Phone shell (< 768 px): one column, bottom navigation (60 px), sidebars become drawers,
  message actions open in a bottom sheet after a long press.
- Density: "comfortable" (default) and "compact" (`data-density="compact"`) tighten message
  spacing; set in Settings → Appearance.

## Motion

| Token           | Value  | Use                                   |
| --------------- | ------ | ------------------------------------- |
| `--dur-instant` | 80 ms  | Press feedback                        |
| `--dur-fast`    | 140 ms | Hover, colour changes, exits          |
| `--dur-base`    | 200 ms | Popovers, new messages, fades         |
| `--dur-slow`    | 320 ms | Drawers, sheets, page-level entrances |

Easing: `--ease-out` for entering, `--ease-in` for leaving, `--ease-in-out` for movement,
`--ease-spring` for small physical feedback (the switch thumb). CSS transitions and the keyframe
animations in `app.css` (fade, pop, rise, drawer, sheet, shimmer) are the default; the Motion
library is used only for the choreographed entrances of the welcome page and the onboarding
steps.

**Reduced motion:** the OS setting (`prefers-reduced-motion`) and the in-app preference
(Settings → Appearance → Motion, stored per device as `data-motion="reduced"`) both reduce every
animation and transition to 1 ms and disable smooth scrolling; components that use Motion check
`useReduceMotion()` and render the final state directly. Content never depends on an animation
to become visible (the welcome headline, for example, slides in but is never transparent).

## Components

Primitives in `apps/web/src/components/ui/` follow the shadcn/ui pattern (Radix primitives +
`class-variance-authority`), styled for this system: `Button` (primary, secondary, ghost,
outline, danger, danger-ghost, link · sizes sm/md/lg/icon), `Input`, `Textarea`, `Select`,
`Label`, `Field` (label + hint + error wiring), `Dialog`/`Sheet`, `Confirm`, `Menu`, `Popover`,
`Tooltip`, `Tabs`, `Segmented`, `Switch`, `Badge`, `Toast`, `Skeleton`, `Spinner`, `EmptyState`. Icons come from Lucide at a 1.75 stroke width.

Rules:

- One primary (amber) button per view; other actions are secondary or ghost.
- Every async action shows progress in place (`loading` buttons, skeletons for lists, a floating
  spinner when older messages load) and reports failure inline or with a toast.
- Every list has an empty state that says what to do next.
- Destructive actions use `danger` styling and a confirmation dialog that names the object.
- Text comes from the i18n dictionary (`t('area.key')`), never inline strings.

## Accessibility

- Contrast is computed from the token values by `apps/web/src/styles/tokens.test.ts` (WCAG 2
  formula; translucent washes composited as the browser does), so a token change that breaks it
  fails the test suite. In both themes, on every surface (app, rail, sidebar, main, elevated,
  overlay, inset): `--text` ≥ 12.8:1, `--text-2` ≥ 8.4:1, `--text-muted` ≥ 5:1; the semantic
  text colours (`--danger`, `--success`, `--warning`, `--info`, `--accent-text`) ≥ 4.6:1, even
  on their own soft background; text on solid fills (`--accent-fg`, `--danger-fg`,
  `--success-fg`) ≥ 6.8:1. `--text-faint` (3.2–4.3:1) is reserved for icons and decorative
  marks, never for text; it and the offline presence ring meet the 3:1 minimum for graphics.
  The focus ring is visible on every surface.
- Presence uses shape as well as colour: filled dot (online), crescent (idle), bar (do not
  disturb), hollow ring (offline), each with an accessible label.
- Every page has a skip link, one `<h1>` and a `<main>` landmark; icon-only buttons have labels;
  form errors are announced (`role="alert"`) and linked to their fields (`aria-describedby`,
  `aria-invalid`).
- Keyboard: all actions are reachable with Tab/Enter/Escape; menus and dialogs come from Radix
  (focus trapping and restoration). In the composer, Enter sends and Shift+Enter adds a line on
  devices with a keyboard; on touch screens Enter adds a line and the send button sends.
- These rules are checked by `e2e/accessibility.spec.ts`; a manual screen-reader review is still
  outstanding ([KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)).
