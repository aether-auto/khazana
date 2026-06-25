// ── The Register — lightweight, paginated card/list view for the feed tail ──
//
// The bento at the top of the feed is the showcase (the freshest, highest-
// resonance catch). Everything *below* it — the long tail of ~850 signals — is
// rendered HERE, client-side, in small batches, as either compact LIST ROWS or
// LIGHT CARDS. This is deliberately cheap: no backdrop-filter glass, no per-node
// IntersectionObserver. The whole point is that the live DOM stays small
// (~40–120 nodes) no matter how many signals exist, so scroll never janks.
//
// Progressive enhancement: the tail data ships as a single <script type=
// "application/json"> payload (text, not DOM). With JS off the bento + a small
// no-JS fallback list still render; with JS on we hydrate the register here.
//
// Channel filter: the ?channel= param (and the in-page filter links) filter the
// FULL tail set — pagination then walks the filtered list, so "load more" and
// the filter compose correctly.

interface RegisterItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  sourceType: string;
  trustScore?: number;
  publishedAt: string;
  topics: string[];
  score?: number;
  comments?: number;
}

type View = "list" | "card";

const BATCH = 40;
const VIEW_KEY = "khz.feed.view";
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;

function timeAgo(iso: string, now: number): string {
  const then = Date.parse(iso);
  const delta = now - then;
  if (Number.isNaN(then) || delta < MIN) return "now";
  if (delta < HOUR) return `${Math.floor(delta / MIN)}m`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h`;
  if (delta < YEAR) return `${Math.floor(delta / DAY)}d`;
  return `${Math.floor(delta / YEAR)}y`;
}

function fmtCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

/** el() helper — make an element with class + optional text, no innerHTML (safe). */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function initRegister(): void {
  const root = document.querySelector<HTMLElement>("[data-register]");
  if (!root) return;
  // Guard against double-init: this module runs once on import AND again on
  // every `astro:page-load` (both fire on the first load under View Transitions).
  // Binding twice would double the rendered rows. Tag the live root so we only
  // wire it once per DOM; View Transitions swaps in a fresh (untagged) root.
  if (root.dataset.registerReady === "1") return;
  root.dataset.registerReady = "1";

  const payloadEl = document.querySelector<HTMLScriptElement>("#register-data");
  const list = root.querySelector<HTMLElement>("[data-register-list]");
  const moreBtn = root.querySelector<HTMLButtonElement>("[data-register-more]");
  const countEl = root.querySelector<HTMLElement>("[data-register-count]");
  const emptyEl = root.querySelector<HTMLElement>("[data-register-empty]");
  const toggle = root.querySelector<HTMLElement>("[data-view-toggle]");
  if (!payloadEl || !list || !moreBtn) return;

  let all: RegisterItem[] = [];
  try {
    all = JSON.parse(payloadEl.textContent || "[]") as RegisterItem[];
  } catch {
    all = [];
  }

  const base = (root.dataset.base ?? "").replace(/\/$/, "");
  const now = Date.now();

  const params = new URLSearchParams(location.search);
  const channel = params.get("channel") ?? "";

  // current view: URL/localStorage > server default (data attr) > list
  let view: View =
    (localStorage.getItem(VIEW_KEY) as View | null) ??
    ((root.dataset.defaultView as View | undefined) || "list");
  if (view !== "list" && view !== "card") view = "list";

  const filtered = channel ? all.filter((it) => it.topics.includes(channel)) : all;
  let shown = 0;

  function buildRow(it: RegisterItem): HTMLElement {
    const row = el("article", "reg-row");
    row.dataset.itemId = it.id;

    const time = el("time", "reg-time", timeAgo(it.publishedAt, now));
    time.dateTime = it.publishedAt;

    const body = el("div", "reg-body");
    const titleLink = el("a", "reg-title", it.title);
    titleLink.href = `${base}/item/${it.id}`;
    body.appendChild(titleLink);

    const meta = el("div", "reg-meta");
    const src = el("span", "reg-src");
    src.appendChild(el("span", "reg-src-type", it.sourceType));
    src.appendChild(el("span", "reg-src-name", it.source));
    meta.appendChild(src);
    for (const t of it.topics.slice(0, 3)) {
      const chip = el("a", "reg-chip", t);
      chip.href = `${base}/?channel=${t}`;
      meta.appendChild(chip);
    }
    body.appendChild(meta);

    const end = el("div", "reg-end");
    if (it.score != null) end.appendChild(el("span", "reg-score", `^ ${fmtCount(it.score)}`));
    const srcLink = el("a", "reg-srclink", "↗");
    srcLink.href = it.url;
    srcLink.rel = "noopener noreferrer";
    srcLink.title = "open the original source";
    srcLink.setAttribute("data-track", "open");
    srcLink.dataset.itemId = it.id;
    end.appendChild(srcLink);

    row.appendChild(time);
    row.appendChild(body);
    row.appendChild(end);
    return row;
  }

  function buildCard(it: RegisterItem): HTMLElement {
    const card = el("article", "reg-card");
    card.dataset.itemId = it.id;

    const top = el("div", "reg-card-top");
    const src = el("span", "reg-src");
    src.appendChild(el("span", "reg-src-type", it.sourceType));
    src.appendChild(el("span", "reg-src-name", it.source));
    top.appendChild(src);
    const time = el("time", "reg-time", timeAgo(it.publishedAt, now));
    time.dateTime = it.publishedAt;
    top.appendChild(time);

    const titleLink = el("a", "reg-card-title", it.title);
    titleLink.href = `${base}/item/${it.id}`;

    const foot = el("div", "reg-card-foot");
    const chips = el("span", "reg-chips");
    for (const t of it.topics.slice(0, 3)) {
      const chip = el("a", "reg-chip", t);
      chip.href = `${base}/?channel=${t}`;
      chips.appendChild(chip);
    }
    foot.appendChild(chips);

    const end = el("span", "reg-end");
    const srcLink = el("a", "reg-srclink", "↗ source");
    srcLink.href = it.url;
    srcLink.rel = "noopener noreferrer";
    srcLink.title = "open the original source";
    srcLink.setAttribute("data-track", "open");
    srcLink.dataset.itemId = it.id;
    end.appendChild(srcLink);
    if (it.score != null) end.appendChild(el("span", "reg-score", `^ ${fmtCount(it.score)}`));
    foot.appendChild(end);

    card.appendChild(top);
    card.appendChild(titleLink);
    if (it.summary) {
      const sum = el("p", "reg-card-sum", it.summary);
      card.appendChild(sum);
    }
    card.appendChild(foot);
    return card;
  }

  function renderBatch(): void {
    const next = filtered.slice(shown, shown + BATCH);
    const frag = document.createDocumentFragment();
    for (const it of next) {
      frag.appendChild(view === "list" ? buildRow(it) : buildCard(it));
    }
    list!.appendChild(frag);
    shown += next.length;
    updateChrome();
  }

  function updateChrome(): void {
    if (countEl) countEl.textContent = `${shown} of ${filtered.length}`;
    moreBtn!.hidden = shown >= filtered.length;
    if (emptyEl) emptyEl.hidden = filtered.length !== 0;
  }

  function reset(): void {
    list!.replaceChildren();
    shown = 0;
    list!.dataset.view = view;
    renderBatch();
  }

  function setView(next: View): void {
    if (next === view) return;
    view = next;
    localStorage.setItem(VIEW_KEY, view);
    syncToggle();
    reset();
  }

  function syncToggle(): void {
    if (!toggle) return;
    toggle.querySelectorAll<HTMLElement>("[data-view]").forEach((btn) => {
      const active = btn.dataset.view === view;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  moreBtn.addEventListener("click", renderBatch);
  toggle?.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest<HTMLElement>("[data-view]");
    if (btn?.dataset.view) setView(btn.dataset.view as View);
  });

  syncToggle();
  reset();
}

initRegister();
// View Transitions swaps the DOM without a full reload — re-init each nav.
document.addEventListener("astro:page-load", initRegister);
