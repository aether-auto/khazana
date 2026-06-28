// REHYPE-NARRATION-INDEX — stamp `data-para-index` onto the prose blocks a Read's
// narration speaks, so the ReadPlayer can highlight the spoken paragraph.
//
// The TTS pipeline (`packages/ingest/src/tts/chunk.ts` → `render.ts`) narrates an
// ordered set of "narratable paragraphs" — every top-level prose `<p>` and every
// heading, in document order, EXCLUDING block-level component JSX (charts,
// Scrolly, DataTable …). It writes a manifest beside the audio whose
// `paragraphs[]` carries, per spoken paragraph, a `startSec` AND the clean spoken
// `text`. The player highlights `[data-para-index="<n>"]` as narration reaches
// `paragraphs[n].startSec`, so each rendered block this plugin stamps must line up
// with the manifest paragraph of the same index.
//
// Why match by TEXT, not document order: the rendered prose contains blocks the
// narration drops — most notably a paragraph that OPENS with a display-math
// `<Annotation … />` (the pipeline's `stripBlockJsx` removes any line starting
// with a component, so that whole paragraph is never spoken). A pure
// order-based index would therefore drift by one from that point on. Instead we
// extract each rendered block's clean text (mirroring the pipeline's stripping:
// math, annotation/sidenote notes, and the sidenote ref marker are dropped) and
// greedily match it to the next manifest paragraph by a stable word-prefix key.
// Blocks with no match (the dropped display-math paragraph) are left un-stamped.
//
// Runs at rehype time on .md/.mdx only (so only Reads), BEFORE KaTeX would inject
// its duplicate LaTeX source text and before note popovers exist — the cleanest
// stage to align. Zero new dependencies: a tiny self-contained HAST walker, no
// unist-util-visit. $0 / offline: a missing manifest is a silent no-op (the page
// renders fine with no player and no highlight targets).

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Where rendered manifests live, relative to this file: apps/site/public/audio/reads.
const AUDIO_DIR = fileURLToPath(new URL("../../public/audio/reads/", import.meta.url));

// How many leading words form the match key. Long enough to be unique per
// paragraph, short enough to survive a trailing annotation/sidenote note that the
// narration drops but the rendered block may still carry after its opening words.
const KEY_WORDS = 8;

/** className → string[] (hast stores it as an array, a string, or undefined). */
function classes(node) {
  const c = node.properties && node.properties.className;
  if (Array.isArray(c)) return c.map(String);
  return c ? [String(c)] : [];
}

/**
 * True for sub-trees whose text the narration does NOT speak, so we drop them
 * when extracting a block's spoken text — mirroring the pipeline's inline
 * stripping in `chunk.ts`:
 *  - `role="note"` — Annotation / Sidenote popover bodies (tooltip asides).
 *  - `.katex*` — typeset math (LaTeX is for the eye, never the ear).
 *  - `.mdx-annot__math` — a math annotation TERM (also LaTeX).
 *  - `.sidenote-ref` — the superscript reference marker.
 */
function isDropped(node) {
  if (node.type !== "element") return false;
  if (node.properties && node.properties.role === "note") return true;
  const cls = classes(node);
  if (cls.some((c) => c.startsWith("katex"))) return true;
  if (cls.includes("mdx-annot__math")) return true;
  if (cls.includes("sidenote-ref")) return true;
  return false;
}

/** Concatenate the spoken text of a HAST node, dropping non-narrated sub-trees. */
function spokenText(node) {
  if (node.type === "text") return node.value || "";
  // Inline MDX components (<Annotation/>, <Sidenote>…</Sidenote>) arrive as
  // mdxJsxTextElement; their visible children are prose, their attributes are not.
  if (node.type === "element" || node.type === "mdxJsxTextElement") {
    if (isDropped(node)) return " ";
    return (node.children || []).map(spokenText).join("");
  }
  return "";
}

/** Normalize to a comparable key: NFKC, lowercase, alphanumerics-and-spaces only. */
function normalize(text) {
  return text
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The first KEY_WORDS words of a normalized string — the greedy match key. */
function prefixKey(normalized) {
  return normalized.split(" ").slice(0, KEY_WORDS).join(" ");
}

/** A direct-child narratable block: a top-level `<p>` or `<h1>`–`<h6>`. */
function isNarratableBlock(node) {
  return node.type === "element" && /^(p|h[1-6])$/.test(node.tagName);
}

/** Derive a Read slug from a content file path (…/content/blog/<slug>.mdx). */
function slugFromPath(filePath) {
  const base = filePath.split(/[\\/]/).pop() || "";
  return base.replace(/\.(md|mdx)$/i, "");
}

/** Load a slug's narration manifest paragraphs ({index, text} marks), or null. */
function loadManifestParagraphs(slug) {
  const path = `${AUDIO_DIR}${slug}.manifest.json`;
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    const paras = raw && Array.isArray(raw.paragraphs) ? raw.paragraphs : null;
    if (!paras) return null;
    // Need both a numeric index and the spoken text to match by content.
    return paras
      .filter((p) => p && typeof p.index === "number" && typeof p.text === "string")
      .map((p) => ({ index: p.index, key: prefixKey(normalize(p.text)), norm: normalize(p.text) }));
  } catch {
    return null;
  }
}

/**
 * Set `data-para-index="<n>"` on a HAST element (creating `properties` as needed).
 */
function stampIndex(node, index) {
  node.properties = node.properties || {};
  node.properties["data-para-index"] = String(index);
}

/**
 * Rehype plugin. For each .md/.mdx Read with a narration manifest, stamp
 * `data-para-index` onto the top-level prose blocks the narration speaks, matched
 * to the manifest paragraphs by normalized text. No manifest → no-op.
 */
export default function rehypeNarrationIndex() {
  return (tree, file) => {
    if (!file || !file.path || !/\.mdx?$/i.test(file.path)) return;
    const marks = loadManifestParagraphs(slugFromPath(file.path));
    if (!marks || marks.length === 0) return;

    const blocks = (tree.children || []).filter(isNarratableBlock);

    // Greedy in document order: each manifest paragraph claims the next rendered
    // block (at or after the last claim) whose prefix key matches. Unclaimed
    // blocks — the display-math paragraph the narration drops — stay un-stamped.
    let cursor = 0;
    let matched = 0;
    for (const mark of marks) {
      for (let j = cursor; j < blocks.length; j++) {
        const block = blocks[j];
        if (block.__claimed) continue;
        const key = prefixKey(normalize(spokenText(block)));
        if (key && key === mark.key) {
          stampIndex(block, mark.index);
          block.__claimed = true;
          cursor = j + 1;
          matched += 1;
          break;
        }
      }
    }

    // Honest signal in the build log if a Read's prose drifts from its manifest —
    // a partial stamp means a stale render; better a loud warning than a silently
    // misaligned highlight.
    if (matched !== marks.length) {
      const slug = slugFromPath(file.path);
      // eslint-disable-next-line no-console
      console.warn(
        `[narration-index] ${slug}: matched ${matched}/${marks.length} manifest paragraphs ` +
          `to rendered prose — highlight may be incomplete (re-render narration?).`,
      );
    }
  };
}
