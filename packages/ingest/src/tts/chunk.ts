/**
 * Pure prose extraction for narration.
 *
 * Turns a Read's raw source (MDX / Markdown / plain text) into an ordered list
 * of clean, *narratable* prose paragraphs — the exact text a TTS voice should
 * speak, in document order. Everything that is visual-only or machinery is
 * removed: YAML frontmatter, import/export lines, JSX/MDX component tags, fenced
 * code blocks, inline `code`, inline/block `$…$` math (LaTeX is for the eye, not
 * the ear), and Markdown link/emphasis syntax (the human-readable text is kept).
 *
 * This module is intentionally side-effect free and fully unit-tested. The
 * paragraph ORDER and INDICES it produces are a contract: the render manifest's
 * `paragraphs[]` marks and the Read page's `data-para-index` attributes both
 * follow this same ordering so the player can highlight the spoken paragraph.
 */

/** A single narratable unit: one prose paragraph (or a heading). */
export interface NarratableParagraph {
  /** Zero-based position in narration order. */
  index: number;
  /** Clean, speakable text — no markup, whitespace collapsed. */
  text: string;
  /** True when this paragraph is a Markdown heading (gets a longer pause after). */
  isHeading: boolean;
}

/** Silence inserted after a normal paragraph, in milliseconds. */
export const PAUSE_BETWEEN_PARAGRAPHS_MS = 300;

/** Silence inserted after a heading (a longer beat before the section body). */
export const PAUSE_AFTER_HEADING_MS = 700;

// ---------------------------------------------------------------------------
// Block-level stripping (operate on the whole document before splitting)
// ---------------------------------------------------------------------------

/** Remove a leading YAML frontmatter block (`---\n…\n---`). */
function stripFrontmatter(src: string): string {
  // Only a frontmatter block at the very top of the document.
  return src.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

/** Remove fenced code blocks (``` or ~~~ fences), including their contents. */
function stripFencedCode(src: string): string {
  return src.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm, "");
}

/** Remove block math `$$ … $$` (possibly spanning lines). */
function stripBlockMath(src: string): string {
  return src.replace(/\$\$[\s\S]*?\$\$/g, " ");
}

/**
 * Remove block-level JSX/MDX components that begin their own line — interactive
 * charts and scroll-driven figures (`<KellyChart … />`, `<Scrolly steps={[…]}>
 * … </Scrolly>`) whose multi-line attribute bodies hold JSON and chart data, not
 * speakable prose. These are visual-only and must be dropped wholesale so their
 * `data={[…]}` / `steps={[…]}` payloads never leak into narration.
 *
 * IMPORTANT: this only targets components that START a line (optionally indented).
 * Inline `<Annotation …/>` / `<Sidenote>…</Sidenote>` that sit *within* a prose
 * sentence are left untouched here and handled later by `stripJsx`, which keeps
 * their human-readable text.
 */
function stripBlockJsx(src: string): string {
  const lines = src.split(/\r?\n/);
  const out: string[] = [];

  for (let i = 0; i < lines.length; ) {
    const line = lines[i] ?? "";
    const opener = /^\s*<([A-Z][A-Za-z0-9]*)\b/.exec(line);
    if (!opener) {
      out.push(line);
      i += 1;
      continue;
    }

    // A block component starts here. Find where its opening tag ENDS — the first
    // `>` that sits outside any quote and at JSX-expression brace depth 0. Naive
    // `indexOf(">")` is wrong because attribute values (e.g. inline `prose:` HTML
    // strings, or `data={[…]}` JSON) can themselves contain `>` and `<`.
    const name = opener[1]!;
    const startCol = line.indexOf("<"); // begin scanning at the opening `<`
    const tagEnd = findOpenTagEnd(lines, i, startCol);
    const selfClosing = tagEnd.selfClosing;
    let next = tagEnd.line + 1;

    if (!selfClosing) {
      // Paired component: consume forward to the matching top-level `</Name>`.
      const closeRe = new RegExp(`</${name}\\s*>`);
      let k = tagEnd.line;
      while (k < lines.length && !closeRe.test(lines[k] ?? "")) k += 1;
      next = k + 1; // drop through (and including) the closing-tag line
    }

    i = next; // the whole component block is dropped
  }

  return out.join("\n");
}

/**
 * Find the line on which a JSX opening tag (begun at `lines[startLine][startCol]`)
 * closes, and whether it is self-closing (`/>`). Scans character by character,
 * tracking string-literal state and `{}` brace depth so that `>`/`<` inside
 * attribute values do not prematurely end the tag.
 */
function findOpenTagEnd(
  lines: string[],
  startLine: number,
  startCol: number,
): { line: number; selfClosing: boolean } {
  let depth = 0; // JSX-expression `{}` nesting
  let quote: '"' | "'" | "`" | null = null;
  let prevNonSpace = "";

  for (let li = startLine; li < lines.length; li++) {
    const text = lines[li] ?? "";
    const from = li === startLine ? startCol : 0;
    for (let c = from; c < text.length; c++) {
      const ch = text[c]!;
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") depth = Math.max(0, depth - 1);
      else if (ch === ">" && depth === 0) {
        return { line: li, selfClosing: prevNonSpace === "/" };
      }
      if (!/\s/.test(ch)) prevNonSpace = ch;
    }
  }
  // Unterminated tag (malformed input) — treat the last line as the end.
  return { line: lines.length - 1, selfClosing: false };
}

// ---------------------------------------------------------------------------
// Inline stripping (operate on a single already-split paragraph)
// ---------------------------------------------------------------------------

/** Replace common Markdown backslash escapes (e.g. `\$`, `\*`) with the bare char. */
function unescapeMarkdown(text: string): string {
  return text.replace(/\\([\\`*_{}\[\]()#+\-.!$<>|~])/g, "$1");
}

/** Strip inline `code` spans entirely (the literal token isn't speakable). */
function stripInlineCode(text: string): string {
  return text.replace(/`[^`]*`/g, " ");
}

/**
 * Strip inline math `$…$` (single-dollar) — LaTeX is visual, never spoken.
 *
 * Strips every *unescaped* `$…$` pair. Prose currency is written escaped
 * (`\$100`); the `(?<!\\)` guards on both delimiters leave escaped `$` (and
 * therefore real dollar amounts) untouched, while removing genuine math like
 * `$f^*$`, `$g(f)$`, `$0.6 - 0.4 = 0.2$`. A digit-based guard is deliberately
 * avoided: it would skip math spans that open with a number and corrupt the
 * pairing of every subsequent `$…$` on the line.
 */
function stripInlineMath(text: string): string {
  return text.replace(/(?<!\\)\$[^$\n]*?(?<!\\)\$/g, " ");
}

/**
 * Strip Markdown emphasis markers (`*italic*`, `_italic_`, `**bold**`), keeping
 * the emphasized words. Run after JSX/code so we don't touch markup tokens.
 */
function stripEmphasis(text: string): string {
  let t = text;
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1"); // bold
  t = t.replace(/\*([^*\n]+)\*/g, "$1"); // italic *
  t = t.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, "$1$2"); // italic _word_
  return t;
}

/**
 * Collapse JSX/MDX tags to their human-readable text content.
 *
 * - `<Annotation term="information theory" note="…" />` → `information theory`
 *   (the `term` attribute is the prose anchor; the `note` is a tooltip aside and
 *   is dropped). For a `math` annotation the term is LaTeX, so it is dropped too.
 * - Paired tags `<Sidenote …>visible text</Sidenote>` → `visible text`.
 * - Any other tag → removed (its attributes are machinery, not prose).
 */
function stripJsx(text: string): string {
  let out = text;

  // Self-closing components: extract a usable `term=` for Annotation-like tags,
  // otherwise drop the whole tag. A `math`-flagged annotation's term is LaTeX —
  // not speakable — so it is dropped along with the note.
  out = out.replace(/<([A-Z][A-Za-z0-9]*)\b([^>]*?)\/>/g, (_m, _name: string, attrs: string) => {
    const isMath = /\bmath\b/.test(attrs);
    const termMatch = /\bterm\s*=\s*"([^"]*)"/.exec(attrs);
    if (termMatch && !isMath) return ` ${termMatch[1]} `;
    return " ";
  });

  // Paired components: keep inner text, drop the open/close tags (and their attrs).
  out = out.replace(/<([A-Z][A-Za-z0-9]*)\b[^>]*>/g, " "); // opening tag
  out = out.replace(/<\/[A-Z][A-Za-z0-9]*\s*>/g, " "); // closing tag

  // Any residual lowercase HTML tags (rare in body prose) → drop.
  out = out.replace(/<\/?[a-z][^>]*>/g, " ");

  return out;
}

/** Replace `[text](url)` with just `text`. */
function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
}

/** Collapse all runs of whitespace to single spaces, fix space-before-punctuation, trim. */
function collapseWhitespace(text: string): string {
  return (
    text
      .replace(/\s+/g, " ")
      // Stripping inline markup can leave a space before punctuation (e.g.
      // "theory , in") — pull the punctuation back onto the preceding word.
      .replace(/\s+([,.;:!?])/g, "$1")
      // Removing mid-sentence math can leave doubled commas ("With,, and")
      // or an empty parenthetical (" ( )") — tidy those into natural prose.
      .replace(/([,;:])\1+/g, "$1")
      .replace(/\(\s*\)/g, "")
      // A comma left dangling at a clause start ("— , so" / "to, the") reads
      // wrong; drop a comma that immediately follows an opener or dash-space.
      .replace(/([—–-])\s*,/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
  );
}

// ---------------------------------------------------------------------------
// Line classification
// ---------------------------------------------------------------------------

/** True for `import …` / `export …` module lines (machinery, never spoken). */
function isModuleLine(line: string): boolean {
  return /^\s*(import|export)\b/.test(line);
}

/** True for a horizontal rule / section separator made only of `-`, `*`, or `_`. */
function isHorizontalRule(line: string): boolean {
  return /^\s*([-*_])\s*(?:\1\s*){2,}$/.test(line.trim());
}

/** Extract heading text if the line is a Markdown ATX heading, else null. */
function headingText(line: string): string | null {
  const m = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
  return m ? (m[1] ?? "") : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract the ordered, clean prose paragraphs to narrate from raw MDX/Markdown.
 *
 * Blank lines delimit paragraphs. Each paragraph is stripped of all non-prose
 * markup; paragraphs that collapse to nothing (pure components, code, math) are
 * dropped. Markdown headings become single-line paragraphs flagged `isHeading`.
 */
export function narratableParagraphs(raw: string): NarratableParagraph[] {
  if (!raw || !raw.trim()) return [];

  // 1. Block-level removals on the whole document.
  let src = stripFrontmatter(raw);
  src = stripFencedCode(src);
  src = stripBlockJsx(src);
  src = stripBlockMath(src);

  // 2. Split into blank-line-delimited blocks, preserving order.
  const blocks = src.split(/\r?\n\s*\r?\n/);

  const out: NarratableParagraph[] = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/);

    // A block may be a heading on its own line (common after our blank-line split).
    const firstNonEmpty = lines.find((l) => l.trim().length > 0);
    if (firstNonEmpty !== undefined) {
      const h = headingText(firstNonEmpty);
      if (h !== null && lines.filter((l) => l.trim().length > 0).length === 1) {
        const cleaned = cleanInline(h);
        if (cleaned) out.push({ index: out.length, text: cleaned, isHeading: true });
        continue;
      }
    }

    // Otherwise: drop module / rule lines, then join the rest into one paragraph.
    const kept = lines.filter(
      (l) => l.trim().length > 0 && !isModuleLine(l) && !isHorizontalRule(l),
    );
    if (kept.length === 0) continue;

    const cleaned = cleanInline(kept.join(" "));
    if (cleaned) out.push({ index: out.length, text: cleaned, isHeading: false });
  }

  return out;
}

/**
 * Parse the `channels` list from a Read's YAML frontmatter. Used by the render
 * pipeline to pick the single narration voice (`voiceForChannels`).
 *
 * Supports both YAML flow style (`channels: ["finance", "data-science"]`) and
 * block style:
 *
 *   channels:
 *     - finance
 *     - data-science
 *
 * Returns the channel strings in order, or `[]` when there is no frontmatter or
 * no `channels` key (the voice policy then falls back to the default voice).
 */
export function frontmatterChannels(raw: string): string[] {
  const fm = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!fm) return [];
  const block = fm[1] ?? "";

  // Flow style: `channels: [a, b]` on one line.
  const flow = /^channels\s*:\s*\[([^\]]*)\]\s*$/m.exec(block);
  if (flow) {
    return splitChannelTokens(flow[1] ?? "");
  }

  // Block style: `channels:` then indented `- item` lines.
  const blockHeader = /^channels\s*:\s*$/m.exec(block);
  if (blockHeader) {
    const after = block.slice((blockHeader.index ?? 0) + blockHeader[0].length);
    const items: string[] = [];
    for (const line of after.split(/\r?\n/)) {
      const m = /^\s*-\s*(.+?)\s*$/.exec(line);
      if (m) items.push(unquote(m[1] ?? ""));
      else if (line.trim() && !/^\s/.test(line)) break; // next top-level key
    }
    return items.filter(Boolean);
  }

  return [];
}

/** Split a flow-style list body (`"a", b, 'c'`) into trimmed, unquoted tokens. */
function splitChannelTokens(body: string): string[] {
  return body
    .split(",")
    .map((t) => unquote(t.trim()))
    .filter(Boolean);
}

/** Strip surrounding single/double quotes from a YAML scalar. */
function unquote(s: string): string {
  return s.replace(/^["']|["']$/g, "").trim();
}

/** Decode the handful of HTML entities that appear in body prose. */
function decodeEntities(text: string): string {
  return text
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "…")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

/** Run the full inline-cleaning pipeline over a single paragraph's raw text. */
function cleanInline(text: string): string {
  let t = stripJsx(text);
  t = stripInlineMath(t);
  t = stripInlineCode(t);
  t = stripMarkdownLinks(t);
  t = stripEmphasis(t);
  t = decodeEntities(t);
  t = unescapeMarkdown(t);
  return collapseWhitespace(t);
}

/**
 * Produce the inter-segment silence (ms) to insert AFTER each paragraph: a
 * longer beat after a heading, a short beat between body paragraphs. The result
 * has one entry per input paragraph, in the same order.
 */
export function pacingPlan(paragraphs: ReadonlyArray<NarratableParagraph>): number[] {
  return paragraphs.map((p) =>
    p.isHeading ? PAUSE_AFTER_HEADING_MS : PAUSE_BETWEEN_PARAGRAPHS_MS,
  );
}
