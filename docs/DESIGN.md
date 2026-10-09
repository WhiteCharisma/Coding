# Design system

The visual identity of Creator Network: what it should feel like, the tokens that implement it,
and the rules components follow. Tokens live in `apps/web/src/styles/tokens.css` and are exposed
to Tailwind utilities in `apps/web/src/app.css`. Components never use raw colours, ad-hoc
spacing scales or one-off durations.

## Direction

**"Aero" — glass windows floating in a bright sky.** The look of the Windows Vista / 7 era and
classic desktop messengers, rebuilt with today's tools and in an original form: translucent
pearl panels with polished edges, a sky behind everything (sun, clouds, a few glass bubbles),
glossy controls with a highlight on their upper half, and luminous sky-blue and aqua accents.
It should feel optimistic, clean and a little nostalgic, never like a generic dark SaaS tool.

- **Two moods, one structure.** *Daylight* (default): azure sky fading to a pearl horizon,
  white glass, deep-navy text. *Twilight*: deep ocean night with an aurora ribbon and a cyan
  horizon glow, smoked glass, pearl text. Settings → Appearance (or the system setting) picks one.
- **Glass carries hierarchy.** Instead of darker/lighter surface steps, panes differ in how much
  sky shows through: the rail dock is the most transparent, the conversation pane the most
  solid (so long reading stays calm). Panes are separated by a strip of sky, not by borders.
- **Gloss is for things you can press.** Buttons, the rail's bubbles, badges, toggles and the
  logo get a specular highlight; content (messages, profiles) stays flat and readable.
- **Colour:** sky blue and aqua for actions and selection, white/pearl and silver for chrome,
  deep ocean navy for text, lavender and an iridescent gradient only as rare highlights.
- **Calm.** The sky is painted once and never animates; light sweeps play once on hover;
  motion is short and purposeful (see Motion).
- **Original artwork only**: the logo (a glossy sky orb with a sound-wave ribbon), the sky
  scenes (pure CSS gradients), the auth/welcome art and the demo images/audio are made in this
  repository. No Microsoft assets, fonts, sounds or screenshots are used.

## Colour tokens

Colours are defined in OKLCH so lightness steps are perceptually even. Light values sit in
`:root` / `[data-theme='light']`, dark ones in `[data-theme='dark']`.

| Group    | Tokens                                                                                     | Use                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Sky      | `--sky-1` … `--sky-4`, `--sun`, `--cloud`, `--cloud-shade`                                 | The page background (`--sky-scene` in `app.css`), top to horizon                                       |
| Glass    | `--bg-rail` → `--bg-sidebar` → `--bg-main` → `--bg-elevated` → `--bg-overlay`; `--bg-inset` | Translucent surfaces, least to most opaque. `--bg-app` is the solid fallback colour                    |
| Material | `--glass-blur`, `--glass-edge`, `--glass-edge-low`, `--glass-sheen`, `--glass-shadow`      | Polished rim, lower edge, specular highlight and drop shadow of a pane                                 |
| States   | `--bg-hover`, `--bg-active`, `--bg-selected`, `--scrim`                                    | Translucent washes so they work on any glass                                                           |
| Borders  | `--border-subtle`, `--border`, `--border-strong`                                           | Hairlines inside panes                                                                                 |
| Text     | `--text`, `--text-2`, `--text-muted`, `--text-faint`                                       | Deep navy (Daylight) / pearl (Twilight). `--text-faint` is for icons and marks, never text             |
| Accent   | `--accent`, `-hi`, `-lo`, `-hover`, `-press`, `-fg`, `-text`, `-soft`, `-border`, `-glow`  | Glossy fills run `-hi` → `-lo`; `--accent-fg` is the navy label on them; `--accent-text` for links     |
| Support  | `--aqua`, `--lavender`, `--iridescent`                                                     | Freshness (aqua) and the rare iridescent touch (brand, special highlights)                             |
| Semantic | `--success`, `--warning`, `--danger`, `--info` (+ `-soft`; `--danger-fg`, `--success-fg`)  | Status only                                                                                            |
| Presence | `--presence-online/idle/dnd/offline` and `-rim`                                            | Glossy orbs with a darker rim; always paired with a distinct shape (see Accessibility)                 |
| Messages | `--mention-bg`, `--mention-bar`, `--code-bg`                                               | Mentions of you get a soft sky wash and a left bar                                                     |
| Focus    | `--ring`, `--ring-glow`                                                                    | 2 px outline plus a soft luminous halo on `:focus-visible`                                             |
| Controls | `--knob`, `--knob-hi`                                                                      | Pearl knobs (switch thumb, avatar mounts, logo highlights)                                             |

Tailwind names map to tokens: `bg-main`, `bg-elevated`, `text-fg`, `text-fg-muted`,
`border-line`, `bg-accent`, `from-accent-hi`, `text-accent-text`, `bg-danger-soft`, …

## Glass, sky and gloss

Reusable classes in `app.css` (components layer):

| Class               | What it does                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `body::before`      | Paints `--sky-scene` once behind everything (fixed, not animated)                                              |
| `.glass`            | Backdrop blur + saturation, polished rim, inner top highlight and lower edge, drop shadow. Colour comes from the surface class next to it (`glass bg-sidebar`) |
| `.pane`             | A window: clips its content and rounds its corners (`--pane-radius`) from 768 px up                            |
| `.titlebar`         | Brighter band with a glossy upper half, for pane headers and dialog titles                                     |
| `.gloss`            | Specular highlight over the upper ~40 % of a control (behind its label)                                        |
| `.sheen-hover`      | One light sweep across a glossy control on hover (pointer devices only, no loop)                               |
| `.iridescent-text`  | Iridescent gradient text for rare highlights                                                                   |
| `.avatar-frame`     | Display picture behind glass: inner rim and a soft reflection over the photo                                   |
| `.avatar-mount`     | Pearl frame for large pictures, glowing in the person's presence colour (`data-presence`)                      |
| `.emboss`           | Soft shadow under white labels printed on coloured pictures and bubbles                                        |

**Fallbacks.** Browsers without `backdrop-filter` get nearly opaque panes (`@supports not` block
in `app.css`), so clouds never show sharply behind text. All contrast numbers below are computed
for the translucent case, which is the harder one.

## Typography

| Role             | Font (self-hosted, variable) | Notes                                                      |
| ---------------- | ---------------------------- | ---------------------------------------------------------- |
| Interface        | Source Sans 3                | 14 px (`text-ui`) for chrome                               |
| Conversation     | Source Sans 3                | 15 px (`text-base`) with 1.45 line height for messages     |
| Display/headings | Source Sans 3 (semibold)     | Page titles, onboarding, welcome page                      |
| Code, durations  | JetBrains Mono               | Inline code, code blocks, audio timestamps                 |

Source Sans 3 (SIL Open Font License) is an open humanist sans in the spirit of Frutiger and
Segoe, whose fonts cannot be bundled; on Windows, Segoe UI is the next fallback. The type scale
(`text-2xs` 11 px … `text-5xl` 54 px) is defined in `app.css`. Fonts are bundled with the app (no
external font CDN) and split by script so browsers download only what a page needs.

## Shape, depth and layout

- Radius: `xs` 4 · `sm` 7 · `md` 10 (buttons, inputs) · `lg` 14 (cards, popovers) · `xl` 18
  (panes) · `2xl` 24 (dialogs). People's pictures are rounded squares (`rounded-avatar`, 30 %);
  communities are round glossy bubbles.
- Depth: glass panes carry `--glass-shadow`; `--shadow-sm/md/lg` for elevation of popovers and
  dialogs, `--shadow-glow` (luminous accent halo) for the selected or featured element.
- Desktop shell (≥ 768 px): floating glass panes with a 10 px strip of sky between them — the
  rail dock (76 px), the sidebar (268 px), the main window; header 54 px. The context panel
  (members or pins, 296 px) is docked from 1280 px and slides in as a sheet on narrower screens.
- Phone shell (< 768 px): one full-bleed column (no pane gaps), a glass bottom navigation
  (62 px), sidebars become drawers, message actions open in a bottom sheet after a long press.
- Density: "comfortable" (default) and "compact" (`data-density="compact"`) tighten message
  spacing; set in Settings → Appearance.

## Motion

| Token           | Value  | Use                                   |
| --------------- | ------ | ------------------------------------- |
| `--dur-instant` | 80 ms  | Press feedback                        |
| `--dur-fast`    | 150 ms | Hover, colour changes, exits          |
| `--dur-base`    | 220 ms | Popovers, new messages, fades         |
| `--dur-slow`    | 360 ms | Drawers, sheets, page-level entrances |

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

- One primary (glossy sky-blue) button per view; other actions are secondary (pearl glass) or
  ghost.
- Every async action shows progress in place (`loading` buttons, skeletons for lists, a floating
  spinner when older messages load) and reports failure inline or with a toast.
- Every list has an empty state that says what to do next.
- Destructive actions use `danger` styling and a confirmation dialog that names the object.
- Text comes from the i18n dictionary (`t('area.key')`), never inline strings.

## Accessibility

- Contrast is computed from the token values by `apps/web/src/styles/tokens.test.ts` (WCAG 2
  formula), so a token change that breaks it fails the test suite. Glass is translucent: every
  surface (app, sidebar, main, elevated, overlay, inset) is composited over each of the four sky
  colours behind it, in gamma-encoded sRGB as browsers blend, and the **worst case** must pass.
  Measured minimums (Daylight / Twilight): `--text` 11.2 / 11.7:1, `--text-2` 8.0 / 8.9:1,
  `--text-muted` 5.3 / 6.0:1; semantic text (`--danger`, `--success`, `--warning`, `--info`,
  `--accent-text`) ≥ 4.8 / 5.7:1, also on their own soft wash; navy `--accent-fg` on the glossy
  accent fills ≥ 6.8 / 6.1:1 (checked under the button highlight too); `--danger-fg` and
  `--success-fg` on their fills ≥ 7.3:1. `--text-faint` (≥ 4.4 / 3.9:1) is still reserved for
  icons and decorative marks; it and the presence rims meet the 3:1 minimum for graphics on every
  surface, including the most transparent rail.
- Presence uses shape as well as colour: glossy orb (online), crescent (idle), barred orb (do
  not disturb), hollow ring (offline), each with an accessible label and a darker rim so it
  stays visible on light glass.
- Every page has a skip link, one `<h1>` and a `<main>` landmark; icon-only buttons have labels;
  form errors are announced (`role="alert"`) and linked to their fields (`aria-describedby`,
  `aria-invalid`).
- Keyboard: all actions are reachable with Tab/Enter/Escape; menus and dialogs come from Radix
  (focus trapping and restoration). In the composer, Enter sends and Shift+Enter adds a line on
  devices with a keyboard; on touch screens Enter adds a line and the send button sends.
- These rules are checked by `e2e/accessibility.spec.ts`; a manual screen-reader review is still
  outstanding ([KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)).
