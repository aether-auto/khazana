# khazana — Two Faces (design spec)

> *khazana has two facets. The **Study** is the founder's private, warm-lit room —
> what one person caught, kept, and made (Feed / Reads / Workshop / Observatory).
> **Atlas** is the same observatory turned outward at the world — measured, cold,
> instrument-forward (Globe / Country Reports / Bias Lab / Theaters / Structure /
> Browser). They share one design **system** and carry two **atmospheres**, and
> crossing between them is a designed signature moment, not a nav click. This spec
> defines the two face identities, the switch transition, and Atlas's top-level IA.*

**Status:** Proposed — spec 8 of 8 (Atlas: Spine → Globe → Bias Lab → Ledger → Extras
→ Conflict Theaters → Government Structure → **Two Faces**)
**Date:** 2026-07-07
**Owner:** Arnav (founder) + Claude (cofounder)
**Cost target:** $0 recurring — same binding constraint as every khazana spec. The
switch mechanism is pure CSS + a few lines of event glue; it adds no dependency, no
paid service, no always-on component.

**Reads first:** `docs/superpowers/specs/2026-07-07-atlas-founder-decisions.md`
(the binding decision record — **D11** is this spec's charter, **D1/D9/D12** bind it),
`.superpowers/research/atlas/two-faces-transition.json` (the verified transition
dossier — every technical claim here grounds in it, not in memory),
`.superpowers/research/art-direction.md` (khazana's motion/3D/perf doctrine — this
spec obeys it, never reinvents it), `docs/superpowers/specs/2026-06-23-khazana-design.md`
(§1–2, the house vision/voice), and `docs/superpowers/specs/2026-07-07-atlas-globe-design.md`
(§0, §9.4 — the Globe is Atlas's atmosphere-definer and explicitly hands its top-level
IA to this spec).

> **Why this spec exists.** D11 sharpened D10 ("Atlas and Feed/Reads share Shell chrome"):
> the faces share the design **system** (tokens, type, motion doctrine) but each carries
> its **own atmosphere** — *shared bones, distinct skin* — and the switch is a designed
> transition. D12 granted full research-grounded autonomy to design it. This spec is
> where "two feels, one transition, and Atlas's IA" gets settled.

---

## 1. Binding decisions (settled)

1. **Two faces, one system.** `data-face="study" | "atlas"` on `<html>` selects an
   **atmosphere layer** — a small delta of CSS custom properties over the shared token
   base (`apps/site/src/styles/tokens.css`). The Study is Face A; Atlas is Face B. The
   type families, spacing scale, reading-comfort numbers, semantic color roles, a11y,
   and reduced-motion doctrine are **invariant across both faces** (§2.3). Only
   atmosphere varies (§2.1–2.2).
2. **The face attribute is SSR-stamped, not runtime-stamped.** khazana is a static
   build; a page's face is a property of its route, known at build time. `Shell.astro`
   writes `data-face` onto `<html>` server-side per route. There is therefore **no
   FOUC and no inline face-detection script** — this improves on the dossier's
   inline-script FOUC pattern (technique *data-attribute atmosphere layer*), which
   exists for client-derived state (localStorage theme); khazana needs none of that
   for face, because the server already knows.
3. **`data-face` is strictly orthogonal to `prefers-color-scheme`.** The site's OS-only
   light/dark theming (`tokens.css` `@media (prefers-color-scheme: light)`) is
   untouched. Each face defines its atmosphere for **both** color schemes so light/dark
   composes independently inside either face (dossier technique *data-attribute
   atmosphere layer*, "composes orthogonally with prefers-color-scheme"). We do **not**
   introduce a `data-theme` toggle; theming stays OS-driven.
4. **Same-face navigation stays Astro `ClientRouter` (SPA); face crossings are real
   document loads.** `Shell.astro` already ships `<ClientRouter />` (line 126) and the
   reveal system depends on its `astro:page-load` lifecycle (line 310). We keep it for
   within-face nav — it drives Signature Moment B (Feed→Read FLIP, art-direction §1) and
   the calm micro-transitions. A **face-crossing link carries `data-astro-reload`**,
   stepping ClientRouter aside so a genuine cross-document navigation happens — which is
   exactly the boundary where native cross-document View Transitions (dossier's #1
   recommendation) belong, and where we do **not** want ClientRouter's DOM-diffing (the
   two faces have different `<html>` attributes and atmospheres). SPA within a face, a
   real document boundary between faces (§4.1).
5. **The switch transition uses native `@view-transition`, not ClientRouter's simulated
   fallback.** `@view-transition { navigation: auto; }` on both faces' documents, with
   `pageswap`/`pagereveal` setting `types` (`to-atlas` / `to-study`) so the two
   directions get genuinely different CSS choreography via `:active-view-transition-type()`
   — all per the dossier's verified Baseline-2026 techniques, zero framework router
   needed for the transition itself (§4).
6. **The switch is one dramatic beat, fired only on face crossings.** Per art-direction
   §7's ~3-beats-per-session budget, the signature transition **never** fires on
   internal same-face navigation — structurally guaranteed, because only face-crossing
   links opt into the typed cross-document transition (decision #4). Everything else is
   a calm ClientRouter swap.
7. **Neither hero WebGL runs during the transition.** First Light (Study) and the Globe
   (Atlas) are `client:visible` and initialize **after** the destination document is
   renderable and the transition has settled (§4.4). The transition animates only
   atmosphere + one shared element — never a live canvas — so we never double-pay WebGL
   cost, and the destination first-paints well under the cross-document VT's 4-second
   renderable timeout (dossier technique *4-second renderable timeout awareness*).
8. **`/atlas` is the Globe.** Atlas's landing surface is the Globe itself (the Globe
   spec's own §9.4 hint), with an **instrument rail** as Atlas's persistent nav (§5.2).

---

## 2. The two faces

### 2.1 Face A — The Study (personal)

> **Design brief:** *The warm-lit room where one person watches the world go by and
> keeps the few things that matter. Amber candlelight from below, editorial calm, the
> reading serif dominant, motion that drifts like a mind at rest. This is the treasury —
> intimate, made, permanent.*

Surfaces: **Feed** (`/`), **Reads** (`/reads`), **Workshop** (`/workshop`),
**Observatory** (`/graph`), **Sources** (`/sources`), **Taste** (`/taste`).

The Study **is the atmosphere the site already has** — art-direction.md's "Observatory"
concept as currently built: warm-near-black ground (`--bg #0a0a08`), amber-as-signal
with generous halation (`--halo-display`), clay-as-attention, Fraunces display warmth
(SOFT/WONK up), the Newsreader reading column, First Light's organic cursor-parallax
drift, the paper-grain reading planes, and the radial amber warmth from below
(art-direction §8, "lit from below — candlelight on the desk"). No atmosphere work is
needed to *make* the Study; it is Face A by default. The only new thing is that it now
carries the explicit label `data-face="study"`.

### 2.2 Face B — Atlas (the world observatory)

> **Design brief:** *The same instrument turned outward. Where the Study is candlelight,
> Atlas is starlight — a colder, wider, denser deck of glass and anodized metal. The
> mono voice leads, data is everywhere, the globe turns with mechanical patience.
> Amber is rationed to real live signal; the room's structural light is a cold slate.
> You are no longer in the room — you are looking through the window at everything.*

Surfaces: **Globe** (`/atlas`), **Country Reports** (`/atlas/reports/[country]`),
**Indicator Browser** (`/atlas/browser`), **Bias Lab** (`/atlas/bias`), **Conflict
Theaters** (`/atlas/theaters/[id]`), **Government Structure** (`/atlas/structure/[country]`),
**Atlas Sources** (`/atlas/sources`).

Atlas's atmosphere is a **cold, instrument-forward delta** over the same tokens. The
concrete moves, each an override under `[data-face="atlas"]`:

| Dimension | Study (Face A) | Atlas (Face B) — the delta |
|---|---|---|
| **Ground** | `--bg #0a0a08` warm-near-black | shift the whole dark ladder a few degrees colder: ground `≈#08090b` (a blue-cold near-black), inset deeper. Same 6-step ladder *structure* (§2.3), colder cast. |
| **Structural accent** | amber leads the chrome | **cool slate `--info #6b8a9e` becomes the structural chrome hue** (rails, ticks, active states, breadcrumbs). Amber (`--accent`) is **reserved harder** — it now means *a genuine live world-event ping*, nothing decorative. |
| **Halation** | generous warm bloom (`--halo-display`) | tighter, cooler glow — a lit point through cold glass, not incandescence in a warm room (art-direction §9 "star light… light through a lens"). |
| **Type emphasis** | Fraunces display warmth prominent; reading serif dominant | **mono-structural emphasis**; Fraunces used sparingly and *colder* (high `opsz`, SOFT/WONK **down** = a harder cut); tabular data everywhere. The reading column, where it appears (a Country Report's prose micro-copy), is **unchanged** (§2.3). |
| **Motion personality** | organic warm drift (parallax, slow 1.06s cursor blink) | precise, mechanical, telemetric — the globe's constant slow rotation, event pings arriving on a poll diff, scrubber ticks. Same easing *vocabulary* (art-direction §7), a colder *feel*. |
| **Texture/grain** | paper (warm, ~6%, `baseFrequency≈0.65`) on reading planes | **anodized metal** dominant (cooler, tighter, lower-opacity grain) on instrument surfaces — the two-material system art-direction §9 already defines, with Atlas leaning to metal. |
| **Chrome density** | generous editorial whitespace; `--maxw 1180px` | **denser**; a persistent instrument rail (§5.2); Atlas surfaces (globe, maps, indicator tables) may break to a **wider** max-width — the world wants the whole viewport. |
| **Ambient floor** | radial amber warmth rising from below | a faint **cold high cast** — screen/starlight from the globe above — instead of candlelight from below. |

### 2.3 What is invariant across both faces (the shared system)

These do **not** change when the face changes. They are the "shared bones" D11 mandates:

- **Type families** — mono (Berkeley/JetBrains), Fraunces, Newsreader (`--font-*` in
  `tokens.css`). Faces change *emphasis and optical settings*, never the faces themselves.
- **Spacing scale** — the 8px-base `--s-*` ladder, identical.
- **Reading-comfort hard numbers — SACRED (art-direction §5, §8).** `--measure 65ch`,
  `--t-read 18px`, `--lh-read 1.62`, `--read #d4cbc0`-class (~9.5:1), `--track-read
  +0.012em`. **A Read reads identically whether you reached it from the Study or from an
  Atlas citation.** The reading column is never re-skinned by face. This is the one line
  the atmosphere layer must not cross.
- **Semantic color roles** — amber = SIGNAL, clay = ATTENTION/taste (art-direction §2
  rule 3, "one accent does one job"). Their *temperature* may shift a few degrees per
  face; their *job* is invariant. A signal is a signal in both worlds.
- **a11y** — focus rings (`--focus`), keyboard nav, the 7–11:1 comfort contrast band,
  WCAG AA on `--ink-label`.
- **Reduced-motion doctrine** — the two-gears model, the ~3-dramatic-beats budget, and
  "reduced-motion = instant, zero choreography" (art-direction §6, §7). Binding in both
  faces and on the switch itself (§4.3).
- **The tonal dark-ladder *structure*** — six steps inset→ground→card→raised→hover→active.
  Atlas tints them colder; both faces have all six.
- **OS light/dark theming** — both faces honor `prefers-color-scheme` (decision #3).

```
   tokens.css  ── :root  (shared: type families, --s-*, reading numbers, ladder, semantics)
        │        └─ @media (prefers-color-scheme: light)  (the light ladder)
        │
   atmosphere.css  ── [data-face="study"] { warm delta }   ← default; already the site
        │            [data-face="atlas"]  { cold delta }
        │            each face defines its delta for BOTH color schemes → composes
        ▼
   <html data-face="…">   ← SSR-stamped per route by Shell.astro (no FOUC, no JS)
```

---

## 3. The current reality (what exists, what changes)

Read straight from the tree so this spec doesn't guess:

- `apps/site/src/layouts/Shell.astro` — the single shared chrome for every Study
  surface: the instrument bezel (topbar), wordmark, nav rail, live signal readout,
  channel row, ⌘K palette, ticker, footer. It **already imports and renders
  `<ClientRouter />`** (lines 22, 126) and the reveal system re-inits on
  `astro:page-load` (line 310). It sets `class:list={{ glass: GLASS }}` on `<html>`.
- `apps/site/src/styles/tokens.css` — the whole token system on `:root`, with the
  light ladder in an OS media query. `color-scheme: dark` default. No `data-theme`, no
  face attribute yet.
- `apps/site/src/components/FirstLight.tsx` / `FirstLightScene.tsx` — the Study's
  `client:visible` OGL hero, already SSR-safe with a baked fallback (the Globe spec §0
  calls these two "the same species of component").

**What this spec changes:** (1) `Shell.astro` stamps `data-face="study"` on `<html>`;
(2) a new `atmosphere.css` (imported after `tokens.css`) carries the two face deltas;
(3) Atlas surfaces render under a new `AtlasShell.astro` that stamps `data-face="atlas"`
and provides the instrument rail (§5.2); (4) face-crossing links get `data-astro-reload`
+ the typed-transition wiring; (5) a small `face-switch.ts` module sets the VT `types`
in `pageswap`/`pagereveal`. Nothing else in the existing Study chrome is disturbed.

---

## 4. The switch transition — the signature moment

One transition, both directions, budgeted at **~600–900ms** (art-direction §7's
DRAMATIC gear; the switch is the beat, spent once per crossing). The metaphor: **the
observatory turning its gaze** — from the warm room outward to the world, and back.

### 4.1 Mechanism (grounded in the dossier)

```
 user clicks a face-crossing link  (carries data-astro-reload)
        │
        ▼  ClientRouter sees data-astro-reload → steps aside → real cross-document nav
        │
  ┌─ outgoing document ─┐                         ┌─ incoming document ─┐
  │ pageswap fires       │   browser snapshots     │ pagereveal fires     │
  │  → set VT type:       │   old doc, loads new,   │  → confirm/echo type  │
  │    to-atlas | to-study│   snapshots new doc     │  → focus handling     │
  └──────────────────────┘                         └──────────────────────┘
        │                                                   │
        └────────►  ::view-transition-* animates, branched by ───────────┘
                    :active-view-transition-type(to-atlas | to-study)
```

- **`@view-transition { navigation: auto; }`** lives in the render-blocking CSS of both
  faces' documents (dossier technique #1; Astro's own 2026-recommended path for static
  sites; ~83% global support; unsupported browsers just navigate normally).
- **`pageswap`** on the outgoing document (dossier technique *pageswap/pagereveal*) reads
  the destination URL and sets the transition **type** — `to-atlas` when leaving the
  Study, `to-study` when leaving Atlas. `pagereveal` on the incoming document echoes it.
  Two separate documents with no shared JS runtime agree on the choreography purely
  through these events — no client router.
- **`:active-view-transition-type(to-atlas)` vs `(to-study)`** branch the
  `::view-transition-old/new` animations in CSS, so the two directions feel different
  (dossier technique *types + :active-view-transition-type()*, Baseline since ~Jan 2026).

### 4.2 What the reader sees, frame by frame

**Study → Atlas (`to-atlas`) — "the room opens onto the world":**
1. `0–120ms`: the Study's warm ambient floor drains — the amber radial from below pulls
   back toward a single point (a deliberate echo of First Light's one star, run in
   reverse). The reading-room warmth recedes.
2. `120–560ms`: the incoming Atlas ground — colder, wider — washes in **from the edges
   inward** (the window widening onto the world), `expo.out`. The `::view-transition-new`
   root cross-fades up as the atmosphere flips warm→cold.
3. throughout: the **wordmark** (`›khazana`) holds its position as a shared morph
   (`view-transition-name: face-mark`), re-skinning its color warm→cold while everything
   around it changes — the one anchor that says "same product, different world."
4. `~560–700ms`: settle. The Globe canvas has **not** animated during any of this; it
   mounts `client:visible` now that the Atlas document is renderable (§4.4).

**Atlas → Study (`to-study`) — "coming home":** the inverse and deliberately *warmer* in
feel — the cold wide world **contracts** back toward center, the amber ambient floor
**re-ignites from below** (candlelight returns), chrome re-skins cold→warm, the wordmark
holds and warms. The direction asymmetry is real, not cosmetic: `to-atlas` *opens out and
cools*; `to-study` *contracts and warms*. Different type = different curve and origin.

**Shared-element discipline (dossier techniques *snapshot-cost discipline* + *view-transition-name:
match-element*):** exactly **one** hand-named element crosses — the wordmark (`face-mark`).
The chrome re-skin rides the root `::view-transition-old/new` cross-fade, **not** a named
snapshot of the whole bezel (a large named element risks exceeding GPU max-texture-size
and inflates memory). Animate only `transform`, `opacity`, and `background-color` inside
the pseudo-elements. This keeps the transition on the ~one-shape budget the dossier
demands.

### 4.3 The degradation ladder

| Tier | Behavior |
|---|---|
| **Full support** (Chrome/Edge 126+, Safari 18.2+, ~83%) | the full choreographed, direction-aware transition above. |
| **No cross-document VT** (Firefox partial, older, ~17%) | `@view-transition` is simply ignored → a normal full-document navigation. The destination **still SSR-stamps its `data-face`**, so the reader lands in the correct, visibly different atmosphere — an instant swap, not a broken one. A single **~200ms `background-color` cross-fade** on the incoming `<body>` (pure CSS, keyed off a `data-just-crossed` attribute the destination sets and clears) gives even this tier a whisper of "you crossed" — vestibular-safe, no layout motion. No polyfill, no JS branch. |
| **Reduced motion** (HARD, art-direction §6) | `@media (prefers-reduced-motion: reduce)` sets `::view-transition-group/old/new { animation: none !important; }` (dossier technique *prefers-reduced-motion gating* — **must be explicit** with native `@view-transition`; it is *not* auto-gated the way ClientRouter was). The DOM swaps instantly, the atmosphere is still correct (SSR-stamped), so the reader still knows they crossed — they lose the choreography, never the signal. The `data-just-crossed` fade is **also** disabled here. |

### 4.4 No double-paying WebGL; the renderable-timeout gate

Neither hero runs during the transition (decision #7). The outgoing face's canvas tears
down with its document; the destination's hero is `client:visible` and initializes only
**after** first paint. Because cross-document VT **silently aborts** if the destination
isn't renderable within 4 seconds (dossier technique *4-second renderable timeout*), the
destination must first-paint on its **SSR fallback** (First Light's baked field / the
Globe's static `GlobeFallback` map — Globe spec §7), never blocked on WebGL init. If it
ever stalls past 4s the transition degrades to a jump-cut with **no visible error** — so
§7's QA explicitly listens for the `pagereveal` `TimeoutError`.

---

## 5. The switch affordance & Atlas IA

### 5.1 Where the switch lives, and how you reach it

The face switch is **not another nav link** — it is an instrument mode-switch, and it
lives in the bezel (the topbar, opposite the wordmark, beside ⌘K):

```
 ┌ topbar / instrument bezel ─────────────────────────────────────────────┐
 │ ›khazana   feed reads workshop observatory sources taste   [142·09] ⌘K  │
 │                                                       ┌ STUDY ⟷ atlas ┐ │
 └───────────────────────────────────────────────────────└──────────────┘─┘
```

- **Form:** a small segmented control, two small-caps mono labels — the current face lit
  (amber in the Study, cool slate in Atlas), the other dim. Reads as tuning the
  instrument to a mode, not a tab. In Atlas's bezel the switch shows `atlas ⟷ study`
  with Atlas lit.
- **It is a real `<a data-astro-reload href>`** — a plain link to the other face's
  landing (`/atlas` or `/`), so it works with zero JS (SSR degradation, §7) and opts
  into the typed cross-document transition when JS + VT are present.
- **Keyboard access:** the switch is focusable with a visible focus ring; and it is a
  **first-class ⌘K command** ("Switch to Atlas" / "Switch to the Study") — the palette
  already exists (`components/cmdk/`), so this is its natural home. This gives keyboard
  users the crossing without hunting for the bezel control.

### 5.2 Atlas's top-level IA (owned here per D11)

`/atlas` **is the Globe** — the atmosphere-definer is the landing (Globe spec §9.4). The
rest of Atlas hangs off an **instrument rail** — Atlas's persistent chrome, distinct from
the Study's topbar. The rail is a narrow left/side column of mono labels (the "instrument"
voice), the current surface lit in cool slate:

```
 /atlas                → Globe            (landing; the world, live)
 /atlas/reports/[c]    → Country Reports  (the Ledger → report, D4)
 /atlas/browser        → Indicator Browser (everything ingested, D4)
 /atlas/bias           → Bias Lab         (spec 3)
 /atlas/theaters/[id]  → Conflict Theaters (spec 6, D6)
 /atlas/structure/[c]  → Government Structure (spec 7, D5)
 /atlas/sources        → Atlas Sources    (world-data provenance; ≠ Study /sources)
```

- **The rail is Atlas's answer to the Study's topbar nav** — same *system* (mono
  small-caps, hairline rules, the lit-active pattern), different *atmosphere* (cold,
  vertical, instrument-dense vs. the Study's warm horizontal editorial bar). This is the
  face difference made navigable.
- **Wayfinding inside Atlas:** a mono breadcrumb in the instrument voice
  (`atlas / theaters / red-sea`), not an editorial one. **Within-Atlas navigation is
  ClientRouter SPA** — moving Globe → Bias Lab is *not* a face crossing and fires **no**
  signature beat (decision #6); it's a calm swap.
- **Deep-links into Atlas from outside** (a shared URL, a bookmark, a cold open): **no
  transition beat.** The document SSR-stamps `data-face="atlas"` and you simply land in
  Atlas's atmosphere directly. `pagereveal` with no prior khazana `pageswap` type (a
  fresh navigation, no outgoing document to animate from) → no typed transition → an
  instant, correct-atmosphere arrival. The signature moment is only ever an *in-session
  crossing*, never a cold load.

---

## 6. Cross-face moments (sanctioned crossings beyond the switch)

Beyond the deliberate bezel switch, content itself sometimes points across the boundary:
a **Read citing a Country Report or a Globe event**; a **Feed item about an event that
exists on the Globe**. These are real face crossings, so they *do* fire the transition —
but the affordance is a footnote-scale wayfinding tell, not a ceremonial button:

- **Treatment:** a small inline mono label pre-colored in the **destination face's**
  accent (a crossing *into* Atlas renders its tell in cool slate even while you're still
  in the Study), with a directional glyph — e.g. `↗ atlas · India report`. The color is
  the wayfinding: "this continues in the other world."
- **A quieter transition variant.** If a Read cites three Atlas reports, three *full*
  ceremonies would blow the ~3-beats-per-session budget on their own. So crossing links
  fire a **lighter typed variant** — same mechanism, a distinct type
  (`to-atlas-quiet` / `to-study-quiet`) that `:active-view-transition-type()` dials down
  to a quick atmosphere cross-fade + the wordmark morph, **~450ms, no full ambient-drain
  ceremony**. The full ceremony is reserved for the deliberate bezel switch; an inline
  citation gets a legible "half-beat." (Grounded in the dossier's `types` technique —
  multiple named types, different choreography, one mechanism.)
- **Degradation:** identical to §4.3 — instant correct-atmosphere swap without VT,
  instant under reduced motion.

---

## 7. Perf & gates

| Aspect | Budget / gate |
|---|---|
| **Transition JS** | the `@view-transition` rule is CSS (zero JS). The only JS is `face-switch.ts` setting the VT `type` in `pageswap`/`pagereveal` — a handful of lines, loaded on all pages but **inert unless a face-crossing nav fires**. No client router is added for the transition. |
| **Zero cost on non-crossing nav** | same-face navigation is unchanged ClientRouter SPA — the face machinery adds **nothing** to it (no listener runs, no atmosphere recompute; the attribute never changes within a face). |
| **Snapshot cost** | exactly **one** hand-named element (`face-mark`, the wordmark); the root cross-fade carries the re-skin. Animate only `transform`/`opacity`/`background-color`. Budget the dossier's measured **~70ms LCP add** on the destination and verify it on a throttled mid-tier device — the transition is its own budget line, never assumed free (dossier technique *snapshot-cost discipline*). |
| **FOUC** | none possible: `data-face` is SSR-stamped (decision #2) and the atmosphere vars live in render-blocking `tokens.css`/`atmosphere.css`. There is no runtime face-detection to flash. |
| **Renderable timeout** | destination first-paints on its SSR fallback (§4.4), well under the 4s cross-document VT abort; QA listens for the `pagereveal` `TimeoutError` so a silent degrade is caught, not shipped. |
| **Font preload / hydration** | a crossing is a full document load, so the destination re-runs Shell's existing font preload (Shell.astro lines 112–113); the woff2s are HTTP-cached → no re-fetch, no reflow. Island hydration (First Light / Globe) is post-transition per `client:visible`. |
| **Prerender the switch** | the opposite face is a *known, finite, high-value* link — the exact case for Speculation Rules prerender (dossier technique #7): prerender `/atlas` (or `/`) on hover/focus of the bezel switch so the VT animates against an already-painted document. Chromium-only; degrades to `<link rel=prefetch>` elsewhere. Eagerness `moderate`, scoped to the two switch URLs only — never blanket-prerender content links. |
| **Measurement plan** | founder doctrine (measure, don't assume): profile the transition frame cost on a throttled mid-tier phone; confirm no CLS from the atmosphere swap; confirm the `TimeoutError` path never fires on the real destination pages; confirm same-face nav shows zero added main-thread work. |

---

## 8. Testing & verification

- **SSR / no-JS (both faces).** With JS off, every Study and Atlas surface is fully
  legible with its correct SSR-stamped atmosphere, and the bezel switch is a plain
  `<a href>` that performs a normal navigation to the other face — **the switch degrades
  to a link**, the crossing still works, only the choreography is gone. A `*-ssr.test.ts`
  (the existing convention across `components/mdx/`) asserts `<html data-face="atlas">`
  is present in the Atlas shell's SSR output and `"study"` in the Study shell's.
- **Reduced-motion, in a real browser** (house convention). Force
  `prefers-reduced-motion: reduce`; confirm the crossing swaps instantly with **zero**
  `::view-transition-*` animation and no `data-just-crossed` fade, and that the
  destination atmosphere is still correct.
- **VT support matrix, spot-checked.** Chrome + Safari: full direction-aware ceremony
  (verify `to-atlas` ≠ `to-study` choreography). Firefox / an older engine: instant
  swap, correct atmosphere, no console error, no orphaned state.
- **No-FOUC check.** View source on a cold-loaded Atlas deep link: `<html data-face="atlas">`
  is in the served HTML; confirm no flash of Study atmosphere on load, and none on an
  in-session crossing.
- **a11y across the transition.** Per VT API semantics, verify focus lands sensibly in
  the destination (its `main` or its switch control), is never trapped or lost, and that
  `pagereveal` focus handling doesn't fight a screen reader. Confirm the ⌘K crossing
  command and the bezel switch both keyboard-reachable with visible focus rings.
- **Beat-budget check.** Confirm the signature transition fires **only** on face
  crossings — navigate Feed→Read, Globe→Bias Lab, apply filters: none of them trigger the
  ceremony (decision #6). Confirm inline crossing links fire the **quiet** variant, the
  bezel switch fires the **full** one.

---

## 9. Build order (each step browser-verified, sign-off at each)

1. **Atmosphere layer first — the faces feel different with zero transition work.**
   SSR-stamp `data-face` in `Shell.astro`; add `atmosphere.css` with the Study delta
   (a no-op codification of today's look) and the Atlas cold delta. Ship it: the Study is
   unchanged, and as Atlas surfaces come online they *already* wear the cold atmosphere.
   This is independently sign-off-able and is the point of the whole spec — *shared bones,
   distinct skin* — even before any transition exists.
2. **The switch affordance + Atlas IA scaffolding.** The bezel switch (as a plain link),
   the ⌘K crossing command, `AtlasShell.astro` + the instrument rail, the `/atlas/*`
   route map. Still no signature transition — just correct navigation between correctly-
   atmosphered faces (a plain full-page load between them). Fully usable here.
3. **The switch transition.** `@view-transition` on both faces, `data-astro-reload` on
   crossing links, `face-switch.ts` setting `to-atlas`/`to-study` in `pageswap`/
   `pagereveal`, the direction-branched CSS, the reduced-motion gate, and the
   no-VT `data-just-crossed` fallback fade. Browser-verify the full ladder (§8).
4. **Cross-face moments.** The inline crossing affordance + the `*-quiet` typed variant.
5. **Prerender polish.** Speculation Rules on the two switch URLs, `prefetch` fallback.

Each step is usable and correct on its own; step 1 alone already satisfies D11's "each
feels different," and step 3 is the demoable signature moment.

---

## 10. Founder open questions (genuinely open — taste calls only)

1. **Atlas's exact accent temperature.** This spec's call: amber stays the *semantic*
   SIGNAL in both faces (invariant), and Atlas adopts cool slate `--info` as its
   *structural* chrome hue (§2.2). The open taste question is the **degree** — does Atlas
   feel right with amber rationed as hard as "live event pings only," or does it want a
   little more amber warmth in its chrome so it doesn't read as clinical? Best judged in
   the browser against the real Globe.
2. **Does the full ceremony wear out within a session,** even at ~700ms and even with the
   quiet inline variant? If crossing back and forth several times starts to feel heavy,
   should there be a session-scoped "seen it, keep it quiet" preference that dials the
   *bezel* switch down to the quiet variant after the first crossing? A feel call.
3. **`/atlas` as the bare Globe, or a one-beat "instrument boot"** before it resolves?
   This spec chooses **Globe-direct** (no extra beat — the crossing transition is already
   the ceremony; a boot splash would double-spend the budget). Flag if you want a boot
   moment as Atlas's own First-Light-equivalent.
4. **The wordmark across faces.** This spec keeps a single `›khazana` mark that re-skins
   its color warm↔cold through the morph. Flag if Atlas should carry a subtly distinct
   lockup (e.g. `›khazana · atlas`) rather than the same mark in a colder light.
```