# Atlas — The Globe (design spec)

> *Atlas's centerpiece: a live 3D news globe where world events "ping" into being as they
> happen, each one showing every outlet's reporting of it side by side — not one canonical
> wire story. This spec defines the component, its choreography, its interaction model, and
> its data contract. It renders pixels; spec 1 (the Spine) defines the data it reads.*

**Status:** Proposed — spec 2 of 8 (Atlas: Spine → **Globe** → Bias Lab → Ledger → Extras →
Conflict Theaters → Government Structure → Two Faces)
**Date:** 2026-07-07
**Owner:** Arnav (founder) + Claude (cofounder)
**Cost target:** $0 recurring — same binding constraint as khazana v1 and the Spine. No paid
APIs, no paid hosting, no websockets, no always-on machine beyond the existing free
Cloudflare Worker.

> **Amended 2026-07-07 after founder interview.** Per the binding decision record
> (`2026-07-07-atlas-founder-decisions.md`, D1–D12), which wins wherever it contradicts this
> spec's original text: the Atlas family grew from five specs to eight (D5, D6, D11) and this
> is now spec 2 of 8. The event card's reportings-count question — this spec's own former
> "single most product-defining open question" (§12) — is **CLOSED by D7**: a spectrum-diverse
> top-N (~7) leading with a corroborated-core line (§6). A globe-wide **conflict lens** mode
> and an escalated-card swap trigger are added per **D6** (new §8.5). Default globe framing is
> now India-forward at the vision level per **D9** (§12); exact rotation values stay
> implementation-time. Atlas's top-level IA and the Globe's role in the face-switch transition
> are now owned by spec 8, Two Faces, per **D11** (§0, §9.4). `data/world/` now lives in the
> private `khazana-world-data` repo, checked out at build time, per **D2** (§2, §9.1).

**Reads first:** `docs/superpowers/specs/2026-07-07-world-data-spine-design.md` (spec 1 — the
`WorldEvent`/`Reporting`/`Outlet` schemas and `data/world/` layout this spec consumes
verbatim), `docs/superpowers/specs/2026-06-23-khazana-design.md` (house vision/voice), and
`.superpowers/research/art-direction.md` (motion/3D/perf doctrine — this spec is written to
obey it exactly, not to reinvent it).

---

## 0. What the Globe is, and what it is not

The Globe is the first pixel Atlas ships. It is a spinning, near-live map of `WorldEvent`s
(spec 1, §3.5) — each a ping of light with a country, a category, a severity, and a bundle of
`reportings[]` from different outlets. Clicking a ping does not open "the story" — it opens
**every outlet's version of the story**, side by side, so the reader sees divergence before
they see consensus. That divergence view is itself deepened by spec 3 (the Bias Lab); the
Globe's job is to *surface* it, not compute it.

**Not in scope here:** the Bias Lab's divergence-index formula (spec 3), the Government
Ledger's country drill-down (spec 4), the Conflict Theaters' escalated-card and theater-page
definitions (spec 6 — §8.5 below only commits to this spec's swap trigger and handoff), and
Atlas's top-level navigation/IA — now owned by spec 8, Two Faces (D11), which also
choreographs the Globe's role in the face-switch transition. This spec assumes the Globe is
reachable at a route (§9.4) and focuses entirely on the component itself.

**Naming note, flagged not resolved:** khazana v1's design spec (§6.1) already lists a
*backlog Read format* called "Atlas" ("map-driven geography story"). That is unrelated to
*this* Atlas (the world-facing second face). The collision is real but harmless as long as
context disambiguates; if it ever causes confusion in the format catalog, renaming the
backlog format is a trivial implementation-time fix, not a spec question.

### Shared DNA with the Feed's "First Light" hero

Both the Globe and the Feed's "First Light" constellation (art-direction.md §1, Signature
Moment A — a live build stream referred to elsewhere as the Feed hero rework) are the *same
species of component*: a lazy, `client:visible`, low-power/reduced-motion-gated custom-WebGL
point field, SSR-invisible until hydrated, with a baked static fallback always present
underneath. They should share:

- the **low-power/reduced-motion detection utility** (§7.3 proposes extracting it once, so
  both components — plus `Model3D.tsx`, which already has its own private copy — read from
  one source of truth instead of three copies of the same two functions);
- the **perf discipline**: DPR cap, caller-owned rAF, pause on `visibilitychange` and on
  scroll-out via `IntersectionObserver`, first paint never blocked by WebGL;
- the **glow/halation treatment** for a lit point in the dark (art-direction §9's "star
  light… glow + a hint of chromatic aberration").

They should **not** share a renderer library, and that is a deliberate, reasoned choice —
see §3.2.

One more shared-DNA note, added post-interview: the Globe is Atlas's atmosphere-defining
signature component — the first pixel that says "this is a different world than
Feed/Reads/Workshop" — and per D11 it will be choreographed *together with* spec 8's
face-switch transition, not designed in isolation. That choreography is spec 8's to design;
this note only flags the relationship.

---

## 1. Binding decisions (settled)

1. **Renderer: cobe, not three.js, not a hand-rolled OGL sphere.** A ~5KB purpose-built
   rotating-globe renderer (`cobe.vercel.app` — already named in art-direction.md §6 entry
   14 as "the reference if a globe ever appears"). Same low-power/reduced-motion/static-
   fallback discipline as `Model3D.tsx`. Full rationale in §3.2; the short version: cobe has
   already solved "rasterize a rotating sphere with lat/lng markers" — the exact problem —
   at a fraction of three.js's bundle, and reinventing it in raw OGL would just be
   re-deriving cobe's own math for no benefit.
2. **"Live" = near-live, $0, no websockets.** Events come from committed `data/world/`
   JSON (spec 1 §4.3) refreshed by the ~20-minute fast-lane cron, plus light client polling
   of the Worker's `GET /world/latest` (spec 1 §4.4). The globe never opens a persistent
   connection.
3. **Event firehose = GDELT**, geo-located into `WorldEvent`s per spec 1's fast lane. Each
   event's `reportings[]` (spec 1 §3.5) carries the per-outlet `{url, tone, stance, frame}`
   this spec's event card renders side by side.
4. **The entrance choreography fires on *new* events only, never on page load.** "Recent
   events animate in, then settle" is interpreted strictly: every event already on the page
   at load renders in its settled, steady state immediately (no flood of pings on visit #1,
   no re-running "First Light" here — that beat is Signature Moment A's, owned by the Feed,
   and art-direction.md's own motion doctrine caps dramatic beats at ~3 per session). Only
   events that arrive via a *subsequent* poll diff — genuinely new since the reader opened
   the page — get the ping treatment (§4).
5. **Clicking an event hands off to the Bias Lab, it does not navigate away from context.**
   The event card (§6) is the Globe's own surface for showing `reportings[]` side by side;
   a "see the full divergence" affordance inside that card is what hands off to spec 3's
   deeper view (§6.3 defines the exact contract).

---

## 2. Architecture at a glance

```
┌─ data/world/ (private khazana-world-data repo, checked out at build — D2) ─┐
│  events/<YYYY-MM-DD>.json   events/latest.json   events/manifest.json*  │
│  outlets/outlets.json                                                    │
└───────────────────────────────────────────────────────────────────────────┘
        │ Astro build (SSR: today's shard → static fallback + initial props)
        ▼
┌─ apps/site — Atlas → Globe page ────────────┐   ┌─ Cloudflare Worker (spec 1 §4.4) ─┐
│  <Globe events={todaysEvents} …/>            │◀──│ GET /world/latest (poll, ~3–5min) │
│  static SVG map (SSR) → cobe canvas (client)  │   │ small rollup, newest-first        │
└────────────────────────────────────────────────┘   └────────────────────────────────────┘
```

`*` `manifest.json` is a small addition this spec asks for on top of spec 1's `data/world/`
layout (spec 1 didn't need it; the Globe's time scrubber does) — see §9.3.

Same ethos as spec 1: **the page works from committed data with zero client-side network
calls**; polling is a pure enhancement that makes an already-complete page fresher. "Committed"
now means committed to the private `khazana-world-data` repo (D2), checked out into
`data/world/` during the public repo's build — the Astro page's own read is unchanged.

---

## 3. Component architecture & hydration

### 3.1 File placement — the `Model3D.tsx` discipline, mapped 1:1

```
apps/site/src/components/atlas/
  Globe.tsx           # thin SSR-safe shell — mirrors Model3D.tsx exactly (see below)
  Globe.css
  GlobeScene.tsx       # lazy-imported: cobe canvas + hit-testing + ping choreography
  GlobeCard.tsx        # the event card (reportings[] side by side) — §6
  GlobeCard.css
  GlobeScrubber.tsx    # the time scrubber — §5.3
  GlobeFallback.tsx    # SSR-safe static map — reuses mdx/Map.tsx's d3-geo + world-atlas
                        # topology + graticule primitives instead of re-deriving them
  lib/
    project.ts          # orthographic lat/lng → screen projection for hit-testing (§3.4)
    ping-queue.ts        # rate-limited entrance-choreography queue (§4)
```

`Globe.tsx` follows `Model3D.tsx`'s pattern point for point:

| `Model3D.tsx` does | `Globe.tsx` does the same |
|---|---|
| `lazy(() => import("./Model3DScene.js"))` | `lazy(() => import("./GlobeScene.js"))` |
| decides `allowGL` once on mount via `isLowPower()` + `prefersReducedMotion()` | identical — same two checks, same one-time decision, SSR always defaults `allowGL=false` |
| a baked static fallback **always rendered**, `aria-hidden` toggles with `allowGL` | `GlobeFallback` (a flat d3-geo map, not a lattice) always rendered underneath the canvas |
| `Suspense` around the lazy scene with a plain-text loading state | identical |
| mounted `client:visible` in the `.astro` page | identical |

The one structural difference: `Model3D` is a *rare, single-instance, per-article* figure;
`Globe` is a *page-level, single-instance-per-route* hero. It still follows the same
SSR-first, progressive-enhancement shape — the Atlas/Globe route's initial HTML is the
static fallback map with today's events plotted as flat dots, fully legible with JS off,
before any canvas ever mounts.

### 3.2 Renderer choice — cobe, and why not OGL for this specific job

Art-direction.md's 3D plan (§6) reserves OGL for the Feed's constellation because that job
is "points + a custom shader" with *arbitrary* 3D positions (channel = angle, recency =
radius) and no real-world geometry to respect. The Globe's job is different in kind: it must
render an **accurate rotating sphere** — real lat/lng, a recognizable landmass silhouette,
correct day/night-style shading, marker placement that matches an actual globe projection.
cobe (`github.com/shuding/cobe`) is *exactly* that, already built, ~5KB, MIT-licensed,
canvas + custom minimal-WebGL (not three.js), with a built-in `markers: [{location, size}]`
API and an `onRender` per-frame hook for rotation control. Rebuilding sphere rasterization +
graticule + landmass texture sampling in raw OGL would be re-deriving cobe's own solved
problem for zero product benefit — the "~5KB cobe/OGL-class" framing in the brief is
satisfied by picking cobe outright, not by hand-rolling an OGL equivalent.

**Where cobe falls short of this spec's needs, and how this spec closes the gap:** cobe
renders markers but does not expose click/hover hit-testing on them (it draws to a canvas
and hands you a per-frame `onRender(state)` callback, nothing else). This spec adds a thin
interaction layer on top (§3.4) rather than asking cobe to do something it isn't designed
for. If that layer turns out to fight cobe's internals harder than expected once someone is
actually building this, falling back to a hand-rolled OGL sphere (full control, more code)
is the documented escape hatch — flagged as an implementation-time call, not re-litigated
here, since it can only really be judged by writing the hit-test layer first.

### 3.3 Component contracts

```ts
// Globe.tsx — the SSR-safe shell, mounted client:visible on the Atlas/Globe page.
export interface GlobeProps {
  /** Server-fetched shard for the page's build date. SSR renders GlobeFallback from
   *  this; the client hydrates the live globe from the same array before the first
   *  poll tick ever fires — no flash of empty state. */
  events: WorldEvent[];
  /** Outlets keyed by Outlet.id, for reportings[] badge lookups in the event card. */
  outlets: Record<string, Outlet>;
  /** Which day this page instance represents — drives the scrubber's initial position
   *  and whether polling is active at all (only "today" polls; see §5.3, §9.2). */
  date: string; // YYYY-MM-DD
  /** Default camera framing — see §8 for what "india" actually changes. */
  focus?: "world" | "india";
}

// GlobeScene.tsx — lazy, cobe-backed. Never imported until allowGL is true.
export interface GlobeSceneProps {
  events: WorldEvent[];
  outlets: Record<string, Outlet>;
  focus: "world" | "india";
  /** Fired on click; also fired on Enter/Space when a marker has keyboard focus
   *  (§7.4 — the globe is not mouse-only). */
  onSelectEvent: (event: WorldEvent) => void;
  /** New event ids since the scene last rendered — drives the ping queue (§4).
   *  Empty on first mount by decision #4 in §1. */
  newEventIds: ReadonlySet<string>;
}
```

### 3.4 Hit-testing — how click/hover work on a canvas cobe doesn't instrument

Every animation frame, `lib/project.ts` converts each event's `{lat, lng}` through the same
orthographic rotation cobe uses internally (its own `phi`/`theta` rotation state, read back
out of the `onRender` callback each frame) into a 2D canvas coordinate plus a front/back-
hemisphere visibility flag (a point on the far side of the sphere is not hittable or
tooltip-eligible, matching what's actually visible on screen). `pointermove`/`click` handlers
compare the pointer position against this projected set with a touch-friendly minimum hit
radius (≥12px, larger than the rendered dot itself) and resolve to the nearest visible event
under that radius, or `null`. This is a standard, well-trodden technique for adding
interactivity on top of cobe-style canvases (multiple public cobe demos do the equivalent);
the exact projection formula should be verified against whichever cobe version is pinned at
build time rather than assumed here — an implementation detail, not a design question.

Hover shows a lightweight tooltip (headline + reporting count, e.g. "Port strike escalates ·
7 outlets"). Click opens the event card (§6). Keyboard users tab through a visually-hidden
list of the currently-visible events in severity-then-recency order (an `aria-live`-safe
approach that doesn't require "clicking" a 3D point with a keyboard) — same list also backs
screen-reader access to markers the sighted hit-test would otherwise gate behind a mouse.

---

## 4. Event-ping entrance choreography

**Trigger:** exclusively new-event arrivals from a poll diff (§9.2), never the initial page
load (decision #4, §1). The distinction is what keeps this "never a permanent distraction" —
a reader who opens the Globe mid-afternoon sees a fully-formed, calm field, not a flood of
50 pings replaying the day's news at them.

**The ping itself** (per art-direction.md §7's DRAMATIC-gear vocabulary, used sparingly):

1. Marker scales `0 → 1.4 → 1` over ~900ms, `expo.out` — "arriving with purpose," matching
   the doctrine's hero-entrance easing signature.
2. A concentric ring expands outward from the marker, radius `0 → ~14px`, opacity
   `0.6 → 0` over ~1.2s, layered *after* the scale-up starts (art-direction §7's "layered
   sequencing," never all-at-once).
3. Settles into the steady-state marker: a dot sized by `severity` and brightened by
   recency-decay that fades over the following hour — the exact same "fresh signal" language
   the Feed already uses for new `FeedItem`s (art-direction §4), applied here to `WorldEvent`s
   instead. This is the one place the Globe and the Feed should visibly rhyme.

**Rate-limiting (visual calm under a burst):**

- At most **6 concurrent ping animations** in flight at once; additional new events in the
  same poll tick queue with a 0.08–0.12s stagger (art-direction §7's standard stagger band)
  rather than firing together.
- If a single poll tick brings in a genuine burst (a breaking-news moment producing dozens
  of near-simultaneous GDELT rows in one region), individual per-event pings would read as a
  strobe, not signal. §11 flags the exact aggregation rule (cluster into one "hot region"
  pulse vs. a hard numeric cap) as a founder open question rather than guessing a threshold
  here.
- An event is pinged **once** — a seen-id set (in-memory for the session, no persistence
  needed) prevents re-pinging something the reader has already watched arrive, even across
  multiple poll ticks or a scrubber round-trip back to "today."

**Reduced motion / low power:** no scale, no ring, no stagger — new events simply appear at
steady state on the next render, exactly like `Model3D.tsx`'s reduced-motion path skips
auto-rotate but keeps drag. This is a hard gate, not a "reduce intensity" — matching
art-direction §6's "`prefers-reduced-motion`: static baked field, no parallax… the feed
simply *is* there" for the constellation.

---

## 5. Interaction model

### 5.1 Spin

Passive auto-rotate at a slow, constant `phi` increment (cobe's own `onRender` pattern),
paused the instant the pointer is over the canvas or a marker has keyboard focus, resumed on
pointer-leave/blur after a short settle delay. Pointer-drag overrides rotation directly (1:1
drag-to-spin, the same tactile contract as `Model3D`'s drag-to-rotate); on release, rotation
decays back to the passive auto-rotate rate with a damped easing rather than stopping dead —
"physicality, barely felt," per art-direction §7's scroll-velocity-feedback principle applied
to drag release instead of scroll.

### 5.2 Hover / click → the event card

Covered in full in §6. In brief: hover = tooltip; click or Enter/Space on a keyboard-focused
marker = the event card opens as a right-side panel (desktop) / bottom sheet (mobile),
**never a route navigation** — the globe stays mounted and spinning behind a scrim, so
closing the card returns to exactly where the reader left it. This mirrors the "continuous
transitions, nothing cuts" principle from art-direction §7, applied to a panel instead of a
full-page morph (a full Signature-Moment-B-style shared-element transition is reserved for
the Feed→Read journey per that spec; the Globe's card is a lighter-weight pattern
appropriate to "glance at 7 outlets," not "enter a 15-minute read").

### 5.3 Filter (category / region / severity)

Small-caps chip filters above or beside the globe, visually consistent with the existing
`ChannelChip.astro` pattern used on the Feed (same component family, not a new visual
language). Filtering **dims, never removes**: non-matching markers fade to low opacity
rather than disappearing, so the globe's silhouette and rotation never visibly jump when a
filter is toggled — the same "instant, no re-fetch" discipline the Feed's channel filtering
already uses (art-direction §4's speed contract), applied here with opacity instead of
DOM removal since these are canvas-drawn points, not DOM cards.

### 5.4 The time scrubber — build-cadence, not live-video

A horizontal instrument-style slider (mono ticks, one per available day, matching the
telemetry rail's typographic voice) lets the reader step backward through `data/world/`'s
daily shards to see the globe "as of" that day, rather than scrubbing within a single day
(the fast lane's ~20-minute cadence is real but not fine-grained enough to make an
intra-day scrubber meaningful — a day-granular scrubber matches the actual data resolution
honestly, instead of implying a precision the ingest doesn't have).

- **"Today"** is live: it renders the build-time shard immediately and starts polling
  `/world/latest` for anything newer (§9.2).
- **Any past day** is static: it fetches `data/world/events/<date>.json` on demand (lazy,
  only when scrubbed to) and freezes — no polling, no ping choreography, a small telemetry
  badge reads "not live — showing 2026-07-03" so the reader is never confused about
  freshness. Scrubbing back to "today" resumes polling immediately.
- Which days are scrubber-reachable at all is driven by `data/world/events/manifest.json`
  (§9.3) rather than trying to enumerate the `data/world/events/` directory client-side.

---

## 6. The event card & the Bias Lab handoff

### 6.1 What it shows — resolved (D7)

A compact card, not a full page: the event's `headline`, `category`/`severity` badges, its
`geo.country` (flag/label), a relative timestamp, then two things D7 settles (closing this
spec's own former "single most product-defining open question"):

1. **A corroborated-core line, leading the card** — the claims that X of Y outlets *across
   the spectrum* mutually confirm, rendered as measured agreement ("corroborated by 9 of 12
   outlets"), never asserted as truth, plus fact-check badges wherever a ClaimReview match
   exists. This computation is **Bias-Lab-owned** (spec 3's divergence/corroboration engine,
   per spec 1 §3.5's note that this class of derived signal is not stored on `WorldEvent`
   itself); this card only **renders** its output, it does not compute it.
2. **A spectrum-diverse top-N of `reportings[]`** (~7 rows) below the core line — each row an
   outlet name + a small lean/reliability chip pulled from `Outlet.bias` (spec 1 §3.4) via
   `reportings[].outletId`, the outlet's own `headline`, its `tone`/`stance`/`frame`, and a
   link out to `url`. The N are selected to **maximize stance/frame/lean spread**, not by
   recency or trust score alone, so the card always shows the *shape* of the coverage rather
   than N near-duplicates of the same take.

This is the Globe's whole reason for existing: the reader sees "corroborated by 9 of 12
outlets" and the 7 most different takes on it, at a glance, before clicking through to any
single one.

### 6.2 Selection & the unabridged list — resolved (D7)

Previously left as a founder open question — the honest tension between "show everything,
that's the whole point" and "some events have 30+ `reportings[]` entries and a card that long
stops being a glance." D7 resolves it in favor of a deliberately partial card: spectrum-
diverse top-N (~7), not exhaustive, compensated by the corroborated-core line so the reader
still gets the "what's agreed" signal even from a partial sample. The **full unabridged
`reportings[]` list stays on the Bias Lab story page** (spec 3 §8.4), one hop away via the
"see the full divergence" affordance (§6.3). Founder-confirmed: no synthesized
"truth-o-meter" — khazana surfaces measured agreement, it never asserts truth.

### 6.3 Handoff contract to the Bias Lab (spec 3)

The card's "see the full divergence" affordance passes exactly two things forward — the
`WorldEvent.id` and the list of `reportings[].outletId` already resolved on this card — so
spec 3 can compute its same-story divergence index (spec 1 §3.5's explicit note that this
index is Bias-Lab-owned, not stored on `WorldEvent`) without re-deriving which outlets
covered this story. The exact transport (URL query param, a route param on a per-event Bias
Lab path, or an in-page panel swap) is spec 3's call to make against its own IA — this spec
only commits to *what* crosses the boundary, not *how* it's routed.

Conflict-category events swap this standard card for the escalated card instead (D6.3, §8.5)
— that card's handoff carries an additional `theaterId` and is defined where the swap itself
is defined, not here.

---

## 7. Perf budget & gates

| Aspect | Budget / gate |
|---|---|
| Renderer bundle | cobe ≈5–8KB gzipped + this spec's glue code (projection, ping queue, card) — target **<20KB** total added JS, excluding React itself (already on the page for other islands) |
| DPR | capped at **1.5** — a globe never needs retina sharpness, same cap as the Feed constellation |
| Frame budget | target **<1ms/frame** GPU for the globe draw itself; never on the layout/paint path |
| rAF ownership | caller-owned loop; **paused on `visibilitychange`** (tab hidden) and via `IntersectionObserver` when scrolled out of view |
| Low-power gate | `isLowPower()` (mobile UA or `deviceMemory<4`) → static fallback, no canvas ever mounts |
| Reduced motion | `prefers-reduced-motion` → static fallback; if the reader explicitly interacts with a "show live globe anyway" affordance (optional, not required), the canvas may mount but with **zero ping choreography, zero auto-rotate** — drag-to-spin still works, matching `Model3D`'s "auto-rotate never runs under reduced-motion; drag still works" precedent exactly |
| Static fallback | `GlobeFallback` — a flat d3-geo/world-atlas equirectangular map (reusing `mdx/Map.tsx`'s existing topology + graticule primitives rather than a new asset), events plotted as flat dots sized/colored by severity/category, filter chips work as plain checkboxes, zero JS required to be useful |
| First paint | never blocked by WebGL — the fallback map is the SSR'd initial HTML; the canvas is a `client:visible` enhancement layered on top once hydrated |
| Shared low-power/reduced-motion util | **implementation note:** extract `isLowPower()`/`prefersReducedMotion()` out of `Model3D.tsx` into a small shared module (e.g. `components/lib/gl-gates.ts`) once `Globe.tsx` needs the identical pair, rather than pasting a third copy — a small DRY cleanup, not a design decision |
| Keyboard access | every marker reachable via a visually-hidden ordered list (severity → recency), same open/close semantics as mouse (§3.4) |

---

## 8. India-focus mode

A `focus="india"` mode (URL param or a toggle in the telemetry rail) changes three things,
all achievable within cobe's existing API rather than requiring a different renderer:

1. **Camera framing** — even the default `focus="world"` framing is now India-forward per
   **D9** (§12): initial `phi`/`theta` bias toward the India/Indian-ocean hemisphere rather
   than a neutral or Atlantic-centered view, on every load, not only in explicit India-focus
   mode. Explicit `focus="india"` narrows further via the zoom bump in (2) below rather than
   being the only place India gets any priority. Exact `phi`/`theta`/tilt and passive rotation
   speed remain implementation-time tuning (§12).
2. **A modest zoom via cobe's `scale`** — cobe supports scaling the rendered sphere up
   within its canvas; India-focus bumps this scale (e.g. ~1.0 → ~1.15) so India's markers
   read as slightly larger/denser without a hard cut to a different projection. This is a
   real limitation worth stating plainly: cobe is a full-sphere renderer, not a
   camera-with-adjustable-FOV — it does **not** support "zoom into a bounding box" the way
   `mdx/Map.tsx`'s d3-geo projection can (`fitExtent` on an India-only feature). This spec
   chooses the smaller, honest zoom bump to keep "one globe, one identity" rather than
   silently swapping to a different 2D projection just for this mode; true state/district
   drill-down is explicitly the Government Ledger's job (spec 4), which already carries
   `CountryProfile.subnational[]` for exactly that depth.
3. **Default filter bias** — India-focus pre-applies (but does not lock) a
   `geo.country === "IND"` filter emphasis and surfaces an India-specific event count in the
   telemetry rail, consistent with §5.3's "dim, don't remove" filtering discipline — the
   world's other events are still visibly present, just deemphasized.

### 8.5 Conflict lens mode — new surface (D6)

A globe-wide **conflict lens** toggle — a mode, not a route change — changes what the globe
foregrounds, per D6's "war has a different mode":

- **Conflict-category events become the primary visual layer.** Severity drives marker size
  and intensity directly, the same visual language §4's steady-state markers already use for
  recency-decay, repurposed here for conflict severity instead.
- **Non-conflict events recede to low opacity, never removed** — the same "dim, never remove"
  discipline §5.3's filtering already establishes, applied globally while the lens is active
  instead of per-filter-chip.
- **Active conflict theaters render as persistent, labeled regions** on the globe (not
  individual markers) that link into their theater pages. The theater boundary/region data,
  labeling, and the theater page itself are spec 6's (Conflict Theaters) to define; this spec
  only commits to the Globe rendering active theaters as a distinct, always-present layer
  while the lens is on.
- **Conflict-category events swap the standard event card (§6) for an ESCALATED card** —
  belligerents, casualty figures with source disagreement shown explicitly, claim-vs-claim
  across opposing sides' outlets. The escalated card's full definition, layout, and data
  contract are spec 6's; this spec commits to exactly two things:
  - the **swap trigger** — `event.category === "conflict"`, or membership in an active
    theater even when the event itself isn't tagged `"conflict"`;
  - the **handoff** — `WorldEvent.id` plus `theaterId` when the event belongs to an active
    theater, the same two-value shape as §6.3's handoff extended by one field.

Conflict lens is orthogonal to India-focus (§8) — both can be active together (e.g.
India-focus + conflict lens surfaces conflict theaters touching India's neighborhood at a
glance, without leaving India-focus).

---

## 9. Data flow

### 9.1 Build time (SSR, zero network)

The Atlas/Globe Astro page reads `data/world/events/<today>.json` (or the requested `date`
if the route supports deep-linking a past day) directly off disk at build time, exactly like
every other khazana page reads committed feed JSON — no fetch, no Worker call, during the
Astro page's own build step. One addition per D2: before this step runs, the public repo's
build now checks out the private `khazana-world-data` repo (via a repo-scoped fine-grained
token held as an Actions secret) into `data/world/`, so from the page's point of view the
read is unchanged — still a plain on-disk read, no fetch, no Worker call. This becomes
`GlobeProps.events` (§3.3) and renders `GlobeFallback` server-side as the initial HTML.

### 9.2 Client time (poll, "today" only)

Once hydrated, and only when `date === today`, the client polls `GET /world/latest` (spec 1
§4.4) on an interval — a few minutes, balanced against the fast lane's ~20-minute commit
cadence so polling isn't meaningfully faster than the data it's reading (exact interval is
an implementation tuning knob, not a spec decision; something in the 3–5 minute range is a
reasonable starting point). Each response is diffed against the ids already rendered; genuinely
new ids become `GlobeSceneProps.newEventIds` for exactly one render pass (§4), then are
folded into steady state. Polling is suspended while the tab is hidden (reuses the same
`visibilitychange` gate as §7) and while the reader has scrubbed away from "today" (§5.4).

### 9.3 The manifest — a small addition to spec 1's layout

Spec 1's `data/world/` layout (§4.3) didn't need a directory listing because nothing there
consumed it; the scrubber does. This spec asks `world-refresh.yml` (spec 1 §4.2) to also
maintain `data/world/events/manifest.json` — a small `{ dates: string[]; counts:
Record<string, number> }` — updated whenever a new daily shard is written or the fast lane's
retention window (spec 1 §8, still an open question there) rolls one off. The manifest is
what the scrubber reads to know which days are reachable at all, instead of trying to probe
the directory from the client.

### 9.4 Route

`apps/site/src/pages/atlas/globe.astro` (or `apps/site/src/pages/atlas/index.astro` if the
Globe is Atlas's landing surface — an IA call owned by spec 8, Two Faces, per D11; not
designed here). Either way, the page composes: fetch today's shard + the outlet registry at
build time → `<Globe events=… outlets=… date=… focus=…/>` mounted `client:visible`, with
`GlobeFallback` as its literal SSR output.

---

## 10. Testing & verification approach

- **SSR fallback test**, mirroring the existing `*-ssr.test.ts` convention already used
  across `apps/site/src/components/mdx/` (e.g. `battlemap-ssr.test.ts`,
  `p2-eventcascade-ssr.test.ts`): `globe-ssr.test.ts` asserts `GlobeFallback` renders a
  legible, complete static map from a fixed `WorldEvent[]` fixture with **no** client JS —
  covers the "first paint is never blocked by WebGL" contract mechanically, not just by
  inspection.
- **`lib/project.ts` unit tests**: given known `phi`/`theta`/`lat`/`lng` fixtures, assert the
  projected screen coordinates and the front/back-hemisphere visibility flag — this is a
  pure function, no canvas needed, and it's the one piece of genuinely fiddly math in the
  whole component.
- **`lib/ping-queue.ts` unit tests**: assert the rate-limiting behavior in §4 directly —
  feed it a burst of >6 simultaneous new-event ids and assert the queue staggers rather than
  firing all at once; assert an id already marked "seen" never re-enters the queue.
- **Browser-verified**, per khazana's standing convention that every component in the
  interactive kit is checked live in a real browser before being considered done (not just
  unit-tested): drag-to-spin, hover tooltip, click → card, filter dimming, and the reduced-
  motion/low-power fallback paths (forced via devtools) all confirmed visually, not assumed
  from the gating logic alone.

---

## 11. Build order (incremental, sign-off at each step)

1. **Static fallback + data plumbing**: `GlobeFallback` (reusing `Map.tsx` primitives) +
   the Astro route reading `data/world/events/<date>.json` at build time. Usable and
   correct with zero WebGL — ships first because it's the thing that must never break.
2. **The live globe, no choreography**: cobe mounted `client:visible`, auto-rotate,
   drag-to-spin, hover tooltip, click → event card (§6) with static (non-pinging) markers.
3. **Filtering** (§5.3) + **the manifest + time scrubber** (§5.4, §9.3).
4. **Polling + the ping choreography** (§9.2, §4) — the "live" feeling, added last and
   deliberately, since it's the piece most likely to need real-world tuning (poll interval,
   burst thresholds) once actual GDELT volume is observed.
5. **India-focus mode** (§8) + the Bias Lab handoff wiring (§6.3), once spec 3 exists to
   receive it.
6. **Conflict lens mode** (§8.5), once spec 6 (Conflict Theaters) exists to receive the
   escalated-card handoff and render theater regions.

---

## 12. Founder open questions

**Closed by the 2026-07-07 founder interview** (`2026-07-07-atlas-founder-decisions.md`):

- ~~Default globe framing/projection~~ — **CLOSED by D9.** India-forward at the vision level:
  the globe's initial framing is biased toward India/the Indian-ocean hemisphere even outside
  explicit `focus="india"` mode. Exact starting `phi`/`theta`/tilt and passive rotation speed
  remain implementation-time tuning, not a vision-level question.
- ~~How many `reportings[]` to show per event card~~ — **CLOSED by D7.** Spectrum-diverse
  top-N (~7) leading with a corroborated-core line; see §6.

**Still genuinely open** (implementation-time, not vision-level):

- **Ping density / rate-limiting for visual calm.** §4 proposes a 6-concurrent cap with
  staggering, but doesn't resolve what happens on a genuine breaking-news burst (dozens of
  near-simultaneous GDELT rows in one region) — individual pings would strobe; the
  alternative is aggregating into a single pulsing "hot region" halo per geographic cluster.
  Worth deciding once real GDELT burst volume is observed, not guessed here.
- **Poll interval** (§9.2) — a few minutes was proposed as a reasonable band against the
  ~20-minute fast lane, but the exact number is a tuning knob better set once Worker
  request-volume/KV-read cost (still free-tier, but worth checking) is observed in practice.
- **cobe vs. the OGL fallback** (§3.2) — this spec commits to cobe as the default; whether
  the hit-testing layer (§3.4) turns out to fight cobe's internals enough to justify the OGL
  escape hatch is something only writing that layer will actually answer.
