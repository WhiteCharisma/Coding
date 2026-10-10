# Design system

The visual identity of Creator Network: what it should feel like, the tokens that implement it,
and the rules components follow. Tokens live in `apps/web/src/styles/tokens.css` and are exposed
to Tailwind utilities in `apps/web/src/app.css`. Components never use raw colours, ad-hoc
spacing scales or one-off durations.

## Direction

**"Aero" — a chat app of real Vista glass over a living Frutiger Aero scene.** The look of the
Vista / 7 era and classic desktop messengers, rebuilt with today's tools and in an original form.
It is an application, not a desktop (no taskbar, Start menu, gadgets or window buttons): each part
of the chat — the channel list, the conversation, the members — is a pane with a true Aero Glass
header and frame (blurred, tinted in the window colour you choose, with diagonal reflections and
glowing text); the message box sits on the glass at the foot of the conversation, as in Windows
Live Messenger; a rail of smoky glass with a glossy orb holds the navigation; and behind it all
moves an animated wallpaper (sun rays, clouds, ribbons of light, green hills, rising bubbles; an
aurora at night). Controls are glossy with a highlight on their upper half, accents are luminous
sky blue and aqua. It should feel optimistic, clean and a little nostalgic, never like a generic
dark SaaS tool.

- **Two moods, one structure.** _Daylight_ (default): azure sky fading to a pearl horizon,
  white glass, deep-navy text. _Twilight_: deep ocean night with an aurora ribbon and a cyan
  horizon glow, smoked glass, pearl text. Settings → Appearance (or the system setting) picks one.
- **Glass is the frame, never the page.** Real glass sits where Vista had it: the header and
  frame of every pane, the foot of the conversation around the message box, the rail and its
  previews, dialogs. What you read (messages, settings, profiles) sits on opaque surfaces, so
  long reading stays calm and nothing has to be re-blurred while it scrolls (see Aero Glass).
- **Gloss is for things you can press.** Buttons, the rail's bubbles, badges, toggles and the
  logo get a specular highlight; content (messages, profiles) stays flat and readable.
- **Colour:** sky blue and aqua for actions and selection, white/pearl and silver for chrome,
  deep ocean navy for text, lavender and an iridescent gradient only as rare highlights.
- **Alive, but quiet.** The wallpaper moves gently (only `transform`/`opacity`) while someone
  can enjoy it, and holds still otherwise: while you scroll or type, behind a dialog, while the
  browser is in the background, after a minute without input, and always with Calm or Reduce
  motion. Everything else plays once: the panes rise into place when the app opens, a light
  sweeps across a pane's glass when it shows a new place, the members pane slides in (see
  Motion).
- **Original artwork only**: the logo (a glossy sky orb with a sound-wave ribbon), the sky
  scenes and the wallpaper (CSS gradients and inline SVG), the auth/welcome art and the demo
  images/audio are made in this repository. No Microsoft assets, fonts, sounds, wallpapers or
  screenshots are used; the Vista look is rebuilt from its ideas (glass, glow, gloss), not copied.

## Colour tokens

Colours are defined in OKLCH so lightness steps are perceptually even. Light values sit in
`:root` / `[data-theme='light']`, dark ones in `[data-theme='dark']`.

| Group      | Tokens                                                                                              | Use                                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sky        | `--sky-1` … `--sky-4`, `--sun`, `--cloud`, `--cloud-shade`                                          | The page background (`--sky-scene` in `app.css`), top to horizon                                                                                                 |
| Glass      | `--bg-rail` → `--bg-sidebar` → `--bg-main` → `--bg-elevated` → `--bg-overlay`; `--bg-inset`         | Translucent surfaces, least to most opaque. `--bg-app` is the solid fallback colour                                                                              |
| Material   | `--glass-blur`, `--glass-edge`, `--glass-edge-low`, `--glass-sheen`, `--glass-shadow`               | Polished rim, lower edge, specular highlight and drop shadow of a pane                                                                                           |
| States     | `--bg-hover`, `--bg-active`, `--bg-selected`, `--scrim`                                             | Translucent washes so they work on any glass                                                                                                                     |
| Borders    | `--border-subtle`, `--border`, `--border-strong`                                                    | Hairlines inside panes                                                                                                                                           |
| Text       | `--text`, `--text-2`, `--text-muted`, `--text-faint`                                                | Deep navy (Daylight) / pearl (Twilight). `--text-faint` is for icons and marks, never text                                                                       |
| Accent     | `--accent`, `-hi`, `-lo`, `-hover`, `-press`, `-fg`, `-text`, `-soft`, `-border`, `-glow`           | Glossy fills run `-hi` → `-lo`; `--accent-fg` is the navy label on them; `--accent-text` for links                                                               |
| Support    | `--aqua`, `--lavender`, `--iridescent`                                                              | Freshness (aqua) and the rare iridescent touch (brand, special highlights)                                                                                       |
| Semantic   | `--success`, `--warning`, `--danger`, `--info` (+ `-soft`; `--danger-fg`, `--success-fg`)           | Status only                                                                                                                                                      |
| Presence   | `--presence-online/idle/dnd/offline` and `-rim`                                                     | Glossy orbs with a darker rim; always paired with a distinct shape (see Accessibility)                                                                           |
| Messages   | `--mention-bg`, `--mention-bar`, `--code-bg`                                                        | Mentions of you get a soft sky wash and a left bar                                                                                                               |
| Focus      | `--ring`, `--ring-glow`                                                                             | 2 px outline plus a soft luminous halo on `:focus-visible`                                                                                                       |
| Controls   | `--knob`, `--knob-hi`                                                                               | Pearl knobs (switch thumb, avatar mounts, logo highlights)                                                                                                       |
| Frame      | `--frame-l`, `--frame-a-min/max`, `--frame-edge`, `--frame-highlight`, `--frame-shadow`, `--streak` | Aero Glass frames: lightness and opacity range of the tint (hue and chroma come from the window colour), dark outer edge, bright inner edge, shadow, reflections |
| Glass text | `--glass-title`, `--glass-title-glow`, `--glass-text-2`, `--glass-text-muted`                       | Text printed on glass, its halo, and the secondary text of glass headers (it replaces `--text-2`/`--text-muted` there)                                           |
| Command    | `--command-hi/mid/lo/edge`, `--caption-*`, `--orb-*`                                                | Pane headers on phones and in drawers, information bars, the red close button of dialogs, the blue glow of glass buttons, the glossy orb                         |
| Dock       | `--dock-hi/lo/text/text-muted/edge`, `--attention-*`                                                | Smoky glass (the rail, its previews, the phone tab bar) and the orange "needs you" flash                                                                         |
| Wallpaper  | `--wp-grass-*`, `--wp-swoosh-*`, `--wp-aurora-*`, `--wallpaper-bright/dark`                         | The animated scene; `--wallpaper-bright/dark` are its extremes, used by the contrast tests                                                                       |

Tailwind names map to tokens: `bg-main`, `bg-elevated`, `text-fg`, `text-fg-muted`,
`border-line`, `bg-accent`, `from-accent-hi`, `text-accent-text`, `bg-danger-soft`, …

## Glass, sky and gloss

Reusable classes in `app.css` (components layer):

| Class                 | What it does                                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `body::before`        | Paints `--sky-scene` once behind everything (fixed, not animated). The sky is `--sky-frost` (sun, clouds, aurora, gradient) plus crisp details (bubbles, stars); on computers the animated wallpaper covers it                                         |
| `.glass`              | Backdrop blur + saturation, polished rim, inner top highlight and lower edge, drop shadow. Colour comes from the surface class next to it (`glass bg-overlay`). For small overlays (menus, popovers, toasts, the composer)                             |
| `.titlebar`           | Brighter band with a glossy upper half, for pane headers and dialog titles                                                                                                                                                                             |
| `.gloss`              | Specular highlight over the upper ~40 % of a control (behind its label)                                                                                                                                                                                |
| `.sheen-hover`        | One light sweep across a glossy control on hover (pointer devices only, no loop)                                                                                                                                                                       |
| `.iridescent-text`    | Iridescent gradient text for rare highlights                                                                                                                                                                                                           |
| `.tile`, `.tile-link` | Glass card inside a pane (`--bg-tile`); `tile-link` lifts slightly and catches a sky-blue edge on hover                                                                                                                                                |
| `.aero-item`          | List rows (channels, conversations, settings, menus): soft edge on hover; when current/selected (`aria-current`, `aria-selected`, `data-selected`, `data-highlighted`) a pale glossy band with a crisp blue edge, in the spirit of Windows 7 selection |
| `.chip`               | Toggle pills (filters, tags, disciplines): pearl glass, glossy sky blue when `aria-pressed`/`aria-selected`                                                                                                                                            |
| `.photo-frame`        | Polished rim over photos in messages                                                                                                                                                                                                                   |
| `.bubble`             | A soap-glass bubble (decoration only, never animated)                                                                                                                                                                                                  |
| `.role-name`          | A name in its community role colour (`--role`): hue kept, lightness clamped per theme so any colour stays ≥ 4.5:1                                                                                                                                      |
| `.avatar-frame`       | Display picture behind glass: inner rim and a soft reflection over the photo                                                                                                                                                                           |
| `.avatar-mount`       | Pearl frame for large pictures, glowing in the person's presence colour (`data-presence`)                                                                                                                                                              |
| `.emboss`             | Soft shadow under white labels printed on coloured pictures and bubbles                                                                                                                                                                                |

All contrast numbers below are computed for the translucent case, which is the harder one.

## Aero Glass (Windows Vista)

`apps/web/src/styles/vista.css`, `components/ui/glass-pane.tsx` (`GlassPane`, `PaneFoot`),
`features/shell/` (`AppShell`, `Rail`, `Wallpaper`) and `components/ui/glass-window.tsx`.

**The material** (`.aero-glass`): backdrop blur (14 px) + saturation 1.8 + a slight brightening,
tinted with `oklch(var(--frame-l) var(--frame-c) var(--frame-h) / var(--frame-a))`, with
diagonal reflection streaks (`--glass-streaks`) fixed to the screen like one sheet of glass over
the scene, a dark outer edge and a bright inner edge. Text on glass has a soft halo in
`--glass-title-glow`, as Vista titles do (`.glass-text`; inside a pane, its header and anything
marked `.on-glass`, which also get the `--glass-text-*` colours). Smoky glass (`.dock-glass`) is
a dark gradient over the same blur.

**Window colour** (Settings → Appearance → Window colour, stored per device in `cn.glass` and
applied before the first paint by `public/theme-init.js`): twelve colours (hue and chroma of the
tint, `WINDOW_COLORS` in `stores/ui.ts`), a colour intensity (0–100 → `--frame-a` between
`--frame-a-min` and `--frame-a-max`) and **Enable transparency**: off gives solid frames without
blur, like Vista Basic, for older computers.

**Why only the frame is glass.** A `backdrop-filter` is redrawn whenever anything behind or
inside the element changes; on large panes it made scrolling back through a long channel twice
as slow (0.2, docs/PERFORMANCE.md). So, as in Vista, a pane is glass only around its content:
four strips (`.pane-frame-*`) around an opaque content area. The glass at the foot of a
conversation (`PaneFoot`) is exactly as tall as the message box, measured as it grows (the pane's
opaque surface stops above it through `--pane-foot`, a custom property registered as not
inherited, so only the pane restyles): no glass lies under the messages, so scrolling them
never touches it (checked by `e2e/aero-shell.spec.ts`).

**What the moving wallpaper costs, and the rules that keep it cheap** (measured in
PERFORMANCE.md → In-app Aero). Any animation means the browser redraws the screen for every
frame: with graphics acceleration that is small, without it (software rendering) about one
processor core, whatever moves. So: the wallpaper holds still whenever nobody is looking at it
(see Direction; `features/shell/Wallpaper.tsx`, with open dialogs counted in `stores/scene.ts`);
its sky is three gradients (`--wallpaper-sky`) on a layer of its own, painted once and never
again when the app's content changes; and no rule may use `:root:has(…)` or a similar selector
on an ancestor of everything (one made every change on the page restyle the whole document).
Transparency off removes the blur but not the redrawing.

**Anatomy** (≥ 768 px), over the wallpaper with 8 px between the parts:

- **The rail** (64 px, smoky glass lit from the left): the glossy orb (Home) on top; Direct
  messages, Notifications, Search, Explore; your communities as glossy bubbles that glow in
  their own colour under the pointer (the glow follows it, as on the Windows 7 taskbar), with a
  bar for unread messages and an orange flash and a count for mentions; resting on one shows a
  smoky-glass preview of what is new there; Create or join. At its foot: the call you are in,
  Sounds (switches and volumes in a popover), Administration (staff), Settings and your picture
  (account menu).
- **The panes**: the channel list (268 px), the conversation, and the members or pins (296 px,
  docked from 1280 px, a drawer below). Each is a small Aero window: its header sits on a 48 px
  strip of glass (glowing title, toolbar buttons that glow blue under the pointer), a 6 px glass
  frame runs around an opaque content area. The conversation's message box sits on glass at its
  foot, with the typing line and the keyboard hint printed on the glass.
- **Information bars** (email reminder, voice call) are glossy strips above the panes.

**Outside the app** (welcome, sign in/up, recovery, onboarding, not found): `GlassWindow`, a
small Vista window on the same animated scene. Onboarding is an Aero wizard: round Back button
on the glass, Continue at the bottom right.

**Dialogs** are small Vista windows (glass frame, glowing title, red close button hanging from
the top edge, opaque body, grey footer); confirmations pulse their default button gently.
Tooltips are pale Vista tooltips; toasts are Vista balloon tips in the bottom right corner.

**Phones** (< 768 px) show one pane at a time with an opaque glossy header bar and a
smoky-glass tab bar: no frames, no wallpaper (the still sky instead), no rail.

**Rule for animations on glass**: never animate `opacity`, `filter` or `mask` on an _ancestor_ of
an element with a backdrop filter — it then blurs only its ancestor, not the scene. Panes rise
and slide with `transform` only; dialogs and public windows fade themselves, never a parent.

## Typography

| Role             | Font (self-hosted, variable) | Notes                                                  |
| ---------------- | ---------------------------- | ------------------------------------------------------ |
| Interface        | Source Sans 3                | 14 px (`text-ui`) for chrome                           |
| Conversation     | Source Sans 3                | 15 px (`text-base`) with 1.45 line height for messages |
| Display/headings | Source Sans 3 (semibold)     | Page titles, onboarding, welcome page                  |
| Code, durations  | JetBrains Mono               | Inline code, code blocks, audio timestamps             |

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
- Computers and tablets (≥ 768 px): the rail (64 px) and the panes (channel list 268 px, the
  conversation, members or pins 296 px docked from 1280 px), 8 px apart over the wallpaper; each
  pane has a 48 px glass header and a 6 px glass frame (`--rail-width`, `--pane-gap`,
  `--pane-radius`).
- Phone shell (< 768 px): one full-bleed column, a smoky-glass tab bar (62 px), sidebars become
  drawers, message actions open in a bottom sheet after a long press.
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
`--ease-spring` for small physical feedback (the switch thumb). Only `transform` and `opacity`
animate (plus one background flash for highlights). Nothing in the interface loops except
loading indicators (skeleton shimmer, spinners, the typing dots) while something is actually
loading or typing — and the wallpaper, which is decoration behind the panes.

| Moment                       | Effect                                                                                              | Level                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Press, hover, focus          | Buttons sink slightly when pressed; glossy buttons get one light sweep on hover; focus glows        | all                                                                                                                                              |
| Menus, popovers, dialogs     | Pop in from their trigger (`--radix-…-transform-origin`), fade out; sheets and drawers slide        | all                                                                                                                                              |
| A message arrives or is sent | Slides up and fades in — only live arrivals and your own sends, never history or reloads            | decor                                                                                                                                            |
| Deleting your message        | The row fades out to the side, then the deletion is sent (restored with an error if it fails)       | all                                                                                                                                              |
| Saving an edit               | The new text flashes softly                                                                         | all                                                                                                                                              |
| Adding a reaction            | The emoji pops with a wobble and six glints fly out; a new reaction pill pops in                    | decor                                                                                                                                            |
| A reaction count changes     | The number rolls in from below                                                                      | all                                                                                                                                              |
| An unread badge goes up      | The badge pops                                                                                      | decor                                                                                                                                            |
| Sending                      | The send icon flies off to the upper right and slides back                                          | decor                                                                                                                                            |
| Opening a photo              | The photo grows from its place in the chat into the viewer (View Transitions; plain fade elsewhere) | all                                                                                                                                              |
| The app opens                | The rail slides in from the left and the panes rise into place one after another                    | decor                                                                                                                                            |
| A pane shows a new place     | A light sweeps once across its glass header                                                         | decor                                                                                                                                            |
| Members or pins              | The pane slides in beside the conversation                                                          | all                                                                                                                                              |
| Rail                         | Buttons glow in their community's colour under the pointer; a mention flashes the button orange     | decor (glow stays)                                                                                                                               |
| Toasts                       | Balloon tips pop up in the bottom right corner                                                      | all                                                                                                                                              |
| Confirmation dialogs         | The default button pulses gently, as in Vista                                                       | decor                                                                                                                                            |
| Wallpaper                    | Sun rays turn, clouds and ribbons drift, bubbles rise, sparkles and stars twinkle, the aurora waves | decor; still with Calm/Reduce; rests while you scroll or type, behind dialogs, in the background and after a minute without input; not on phones |

**Motion levels** (Settings → Appearance → Motion, stored per device as `data-motion`):

- **Full motion** (default): everything above.
- **Calm** (`data-motion="calm"`): quick, useful transitions stay; everything marked `.decor`
  (slide-ins, pops, glints, the send flight) and the hover light sweeps do not play, and spring
  easing becomes a plain ease-out.
- **Reduce motion** (`data-motion="reduced"`, also forced by the OS `prefers-reduced-motion`):
  every animation and transition is reduced to 1 ms and smooth scrolling is off; the photo zoom
  and the delete delay are skipped; components that use Motion render their final state directly
  (`useMotionLevel()`, `useReduceMotion()`, `useDecorativeMotion()` in `lib/motion.ts`).

Content never depends on an animation to become visible (the welcome headline, for example,
slides in but is never transparent). The message list stays pinned to the newest message when a
reaction, an edit, the growing composer or the phone keyboard changes the size of what is shown.

## Sound

Interface sounds are **original**: synthesised at run time with the Web Audio API
(`apps/web/src/lib/sound-recipes.ts`) from sine/triangle oscillators, inharmonic "glass"
partials and filtered noise. There are no audio files, samples or third-party assets, so nothing
needs a licence and nothing is downloaded.

| Sound                      | When                                                                    | Character                        |
| -------------------------- | ----------------------------------------------------------------------- | -------------------------------- |
| `send`                     | You send a message (once — not again when the server confirms it)       | light upward whoosh + soft blip  |
| `receive`                  | Someone else writes in the conversation you are reading (not in DND)    | two glassy notes                 |
| `notification`             | A mention, reply, DM or invitation while you are elsewhere (not in DND) | bright three-note rise           |
| `click`                    | Rail navigation, switches, segmented controls                           | tiny glass tick (6 dB quieter)   |
| `open`                     | Opening a conversation                                                  | soft bubble with a faint sparkle |
| `reaction`                 | You add a reaction                                                      | two rising bubble "plips"        |
| `voiceJoin` / `voiceLeave` | Joining / leaving a voice channel                                       | warm rising / falling pair       |
| `uploadDone`               | A file finished uploading                                               | one clear glass ding             |
| `success`                  | A success message (saved, created, sent, copied)                        | bright major third               |

- **Two channels**, each with its own switch and volume in Settings → Notifications → Sounds
  (stored per device): interface sounds (default on, 50 %) and notification sounds (on, 70 %).
  The slider maps to gain as (volume/100)², close to how loudness is perceived.
- **Consistent loudness**: `node scripts/sound-levels.mjs` renders every recipe offline in
  Chromium and reports its peak and loudest 50 ms RMS; the `LEVEL` trims bring all sounds to
  −24 dBFS short-term RMS at 100 % (the click deliberately to −30). Measured peaks: −12.7 to
  −16.6 dBFS (no clipping).
- **No duplicates**: the same sound never plays twice within a short gap (150 ms by default,
  1.2 s for `receive`, 1.5 s for `notification`), so an optimistic message and its confirmation,
  or a burst of messages, give one sound.
- **Autoplay rules**: audio starts only after the first pointer or key press on the page; before
  that every sound is skipped silently. A context created by that very gesture plays as soon as
  it has started.

## Components

Primitives in `apps/web/src/components/ui/` follow the shadcn/ui pattern (Radix primitives +
`class-variance-authority`), styled for this system: `Button` (primary, secondary, ghost,
outline, danger, danger-ghost, link · sizes sm/md/lg/icon), `Input`, `Textarea`, `Select`,
`Label`, `Field` (label + hint + error wiring), `Dialog`/`Sheet`, `Confirm`, `Menu`, `Popover`,
`Tooltip`, `Tabs`, `Segmented`, `Switch`, `Badge`, `Toast`, `Skeleton`, `Spinner`, `EmptyState`, `Orb` (a glossy
round bubble holding an icon: channel headers, intros, empty states, file cards, feature lists). Brand pieces:
`LogoMark`/`Logo` and `SkyArt` (light ribbons and glass bubbles behind the public pages on phones). Vista pieces:
`GlassPane` and `PaneFoot` (the app's panes), `Rail` (navigation, previews, sounds), `GlassWindow` (a window outside
the app), `Wallpaper`/`PublicBackdrop`. Icons come from Lucide at a 1.75 stroke width.

Screen patterns: the channel header sits on the pane's glass (`.pane-head`, `.command-btn`) with an `Orb` for the
place; section headings inside pages are sky-blue semibold text followed by a fading hairline (Control Panel style);
public pages (welcome, sign in/up, recovery, onboarding, not found) are `GlassWindow`s on the animated scene; member
lists fold by group like a contact list ("Online (3)"); people's pictures are rounded squares, communities round
bubbles.

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
- Vista glass is checked the same way, over both extremes of the wallpaper
  (`--wallpaper-bright`/`-dark`) with the reflections on top: text on pane headers and on the
  conversation's glass foot (`--glass-title`, `--text`, `--glass-text-2`, `--glass-text-muted`)
  for all twelve window colours at the lowest and highest intensity and with transparency off
  (counting the halo as 40 % cover, what it gives beside a single thin stroke); text in the
  message box over that glass; text on smoky glass (rail previews, phone tab bar, also over a
  pane); text on the opaque header bars of phones and drawers and on information bars; rail
  icons (3:1) while a button flashes orange.
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
