// packages/generate/src/numeric-consistency.ts
//
// Deterministic, PURE check for the exact defect class that killed every Read in
// the 2026-07-06 run: a one-shot fix corrects a number in ONE place and leaves a
// STALE copy elsewhere (prose "0.31" vs chart "0.29"; table "3,255" vs prose
// "3,231"). No LLM involved — this is a syntactic cross-reference over the MDX
// text itself.
//
// Scope (deliberately narrow — precision over recall; a noisy checker that
// false-positives on unrelated numbers is worse than useless):
//
//  1. STRUCTURED cross-component pass: parse <StatBand>/<DataTable>/<Chart> prop
//     literals (JSON5-ish object/array literals, no eval) into labeled numeric
//     values. If the SAME normalized label shows up more than once across these
//     components with a materially different value (same decimal-precision
//     class, same unit), that's a hard, low-noise signal — both sides are
//     machine-authored data, not fuzzy prose.
//  2. STRUCTURED-vs-PROSE pass: for each structured value, search the body prose
//     (and component `caption` strings, which are prose too) for its anchor text
//     (a DataTable/Chart row's string identifier, or a StatBand's label). If
//     found, look for the nearest number in the same sentence-ish window and
//     compare it against the structured value under the same precision/unit
//     gates.
//
// What it deliberately does NOT catch: symbolic mismatches (O(n^2) vs O(n^3) —
// no numeric token involved), numbers rounded to different precision on purpose
// ("about 3,000" vs "3,255" — a hedge word or precision-class mismatch skips
// it), and anything inside <Chart> whose x-axis isn't a string category (a
// continuous/date x-axis has no stable anchor text to search prose for).

const MIN_ANCHOR_ALNUM = 4;

// ── Line/column + text-region helpers ──────────────────────────────────────

function lineCol(src: string, index: number): { line: number; column: number } {
  let line = 1;
  let last = -1;
  for (let i = 0; i < index && i < src.length; i++) {
    if (src[i] === "\n") {
      line++;
      last = i;
    }
  }
  return { line, column: index - last };
}

/** Replace a slice of `s` with spaces, preserving newlines and length/offsets. */
function blankRange(s: string, start: number, end: number): string {
  let out = s.slice(0, start);
  for (let i = start; i < end; i++) out += s[i] === "\n" ? "\n" : " ";
  return out + s.slice(end);
}

/**
 * Body-prose corpus: SAME LENGTH as the input (so every surviving index is
 * still valid against the original mdx for line-number lookup). Blanks
 * frontmatter, fenced/inline code, and all JSX tag markup (attributes) — but
 * NOT the text between an opening and closing tag, which is prose.
 */
function maskForProse(mdx: string): string {
  let s = mdx;
  const fm = s.match(/^---\n[\s\S]*?\n---\n/);
  if (fm) s = blankRange(s, 0, fm[0].length);
  s = s.replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1?\2[^\n]*$/gm, (m) => m.replace(/[^\n]/g, " "));
  s = s.replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));
  // Blank JSX tag markup only (attributes live here); leave inter-tag text alone.
  s = s.replace(/<\/?[A-Za-z][^>]*>/g, (m) => m.replace(/[^\n]/g, " "));
  return s;
}

/** Neutralize hyphen/space differences without changing string length. */
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[-–—]/g, " ");
}

function normalizeLabel(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeUnit(u: string): string {
  return u.trim().toLowerCase();
}

function alnumLength(s: string): number {
  return s.replace(/[^a-z0-9]/gi, "").length;
}

function decimalsOf(raw: string): number {
  const m = raw.match(/\.(\d+)/);
  return m ? m[1]!.length : 0;
}

// ── Bracket-balanced scanning (JS/JSON-like, string-literal aware) ─────────

/** Given text[openIdx] is one of `{[`, return the index of its matching close. */
function findMatchingBracket(text: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < text.length && text[i] !== q) {
        if (text[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

interface AttrSpan {
  kind: "string" | "expr";
  text: string;
  /** absolute offset into the ORIGINAL mdx of the first character of `text`. */
  start: number;
}

interface ComponentTag {
  tagStart: number;
  attrs: Map<string, AttrSpan>;
}

/** Scan every `<Name ...>`/`<Name ... />` opening tag, capturing attribute spans. */
function scanComponentTags(mdx: string, name: string): ComponentTag[] {
  const tags: ComponentTag[] = [];
  const tagRe = new RegExp(`<${name}\\b`, "g");
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(mdx)) !== null) {
    const tagStart = m.index;
    let i = m.index + m[0].length;
    const attrs = new Map<string, AttrSpan>();
    scan: while (i < mdx.length) {
      while (i < mdx.length && /\s/.test(mdx[i]!)) i++;
      if (i >= mdx.length) break;
      const c = mdx[i]!;
      if (c === ">") {
        i++;
        break;
      }
      if (c === "/" && mdx[i + 1] === ">") {
        i += 2;
        break;
      }
      if (c === "/") {
        i++;
        continue;
      }
      if (!/[A-Za-z_]/.test(c)) break; // malformed tag; bail out, skip it
      const nameStart = i;
      i++;
      while (i < mdx.length && /[A-Za-z0-9_:-]/.test(mdx[i]!)) i++;
      const attrName = mdx.slice(nameStart, i);
      while (i < mdx.length && /\s/.test(mdx[i]!)) i++;
      if (mdx[i] !== "=") continue; // boolean attribute
      i++;
      while (i < mdx.length && /\s/.test(mdx[i]!)) i++;
      const v = mdx[i];
      if (v === "{") {
        const end = findMatchingBracket(mdx, i);
        if (end === -1) break scan;
        attrs.set(attrName, { kind: "expr", text: mdx.slice(i + 1, end), start: i + 1 });
        i = end + 1;
      } else if (v === '"' || v === "'") {
        const open = i;
        i++;
        while (i < mdx.length && mdx[i] !== v) {
          if (mdx[i] === "\\") i++;
          i++;
        }
        attrs.set(attrName, { kind: "string", text: mdx.slice(open + 1, i), start: open + 1 });
        i++;
      } else {
        continue;
      }
    }
    tags.push({ tagStart, attrs });
  }
  return tags;
}

/** Split `[ {...}, {...} ]`-shaped expression text into its top-level object items. */
function splitTopLevelObjectItems(exprText: string, exprStart: number): { raw: string; start: number }[] {
  const items: { raw: string; start: number }[] = [];
  let regionStart = 0;
  let regionEnd = exprText.length;
  const firstBracket = exprText.indexOf("[");
  if (firstBracket !== -1) {
    const end = findMatchingBracket(exprText, firstBracket);
    if (end !== -1) {
      regionStart = firstBracket + 1;
      regionEnd = end;
    }
  }
  let i = regionStart;
  while (i < regionEnd) {
    const c = exprText[i]!;
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < regionEnd && exprText[i] !== q) {
        if (exprText[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === "{") {
      const end = findMatchingBracket(exprText, i);
      if (end === -1 || end > regionEnd) break;
      items.push({ raw: exprText.slice(i, end + 1), start: exprStart + i });
      i = end + 1;
      continue;
    }
    i++;
  }
  return items;
}

/** Lenient JS-object-literal -> JSON text conversion (unquoted keys, trailing commas). */
function toJsonish(raw: string): string {
  let s = raw;
  s = s.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*):/g, '$1"$2"$3:');
  s = s.replace(/'((?:[^'\\]|\\.)*)'/g, (_m, inner: string) => `"${inner.replace(/"/g, '\\"')}"`);
  s = s.replace(/,(\s*[}\]])/g, "$1");
  return s;
}

function lenientParseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(toJsonish(raw));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

/** Parse a table/chart CELL that may be a bare number or a formatted numeric string. */
function parseNumericCell(cell: unknown): { value: number; raw: string; unit: string; decimals: number } | null {
  if (typeof cell === "number" && Number.isFinite(cell)) {
    const raw = String(cell);
    return { value: cell, raw, unit: "", decimals: decimalsOf(raw) };
  }
  if (typeof cell === "string") {
    const trimmed = cell.trim();
    const m = trimmed.match(/^(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+\.\d+|-?\d+)(%)?$/);
    if (!m) return null;
    const raw = m[1]!;
    const unit = m[2] ?? "";
    const value = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(value)) return null;
    return { value, raw, unit, decimals: decimalsOf(raw) };
  }
  return null;
}

// ── Numeric mentions ────────────────────────────────────────────────────────

export interface NumericMention {
  /** Human-readable label for this quantity (composed for structured mentions). */
  label: string;
  normalizedLabel: string;
  value: number;
  /** The raw numeric text, without unit (e.g. "3,255", "0.31", "12"). */
  raw: string;
  /** A unit/suffix captured alongside the value ("%", " TFLOPS", "", ...). */
  unit: string;
  /** Digits shown after the decimal point — the "precision class" for comparisons. */
  decimals: number;
  /** 1-based line in the original mdx. */
  line: number;
  source: "component" | "prose";
  component?: string;
  /** Where this mention lives, for a fix-writer to act on (e.g. "DataTable rows[].casualties (France)"). */
  location: string;
}

export interface NumericConsistencyFinding {
  label: string;
  a: NumericMention;
  b: NumericMention;
  message: string;
}

const NUMERIC_TOKEN_RE =
  /(?<![A-Za-z0-9])(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+\.\d+|-?\d+)(?![A-Za-z0-9])/g;

const HEDGE_RE =
  /(roughly|about|approximately|nearly|around|circa|~|over|under|at least|at most|more than|less than|up to|between|estimated|approx\.?|some)\s*$/i;

function isRangeFollow(text: string, endIdx: number): boolean {
  const after = text.slice(endIdx, endIdx + 3);
  return /^\s?[-–—]\s?\d/.test(after);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Is the text immediately following a prose number COMPATIBLE with the
 * structured side's unit? We don't extract an independent "unit token" from
 * prose (a trailing common noun like "casualties" is not a unit) — instead we
 * only ask: does the expected unit text show up right after the number (when
 * the structured side HAS one), or is a stray "%" ABSENT (when it doesn't)?
 */
function unitCompatibleAfter(windowText: string, numEnd: number, expectedUnit: string): boolean {
  const after = windowText.slice(numEnd, numEnd + 20);
  if (expectedUnit === "") return !/^\s?%/.test(after);
  return new RegExp(escapeRegExp(expectedUnit), "i").test(after);
}

function makeComponentMention(opts: {
  mdx: string;
  label: string;
  value: number;
  raw: string;
  unit: string;
  decimals: number;
  offset: number;
  component: string;
  location: string;
}): NumericMention | null {
  if (alnumLength(opts.label) < MIN_ANCHOR_ALNUM) return null;
  const { line } = lineCol(opts.mdx, opts.offset);
  return {
    label: opts.label,
    normalizedLabel: normalizeLabel(opts.label),
    value: opts.value,
    raw: opts.raw,
    unit: opts.unit,
    decimals: opts.decimals,
    line,
    source: "component",
    component: opts.component,
    location: opts.location,
  };
}

interface StructuredMention extends NumericMention {
  /** Anchor text to search prose for (row identifier, or the label itself). */
  anchorText: string;
  /** When set, a candidate prose number must appear near this word too (disambiguation). */
  disambiguator?: string;
}

function extractStatBandMentions(mdx: string): StructuredMention[] {
  const out: StructuredMention[] = [];
  for (const tag of scanComponentTags(mdx, "StatBand")) {
    const stats = tag.attrs.get("stats");
    if (!stats || stats.kind !== "expr") continue;
    const items = splitTopLevelObjectItems(stats.text, stats.start);
    items.forEach((item, i) => {
      const obj = lenientParseObject(item.raw);
      if (!obj) return;
      const label = typeof obj.label === "string" ? obj.label : undefined;
      const value = typeof obj.value === "number" ? obj.value : undefined;
      if (label === undefined || value === undefined || !Number.isFinite(value)) return;
      const suffix = typeof obj.suffix === "string" ? obj.suffix : "";
      const prefix = typeof obj.prefix === "string" ? obj.prefix : "";
      const unit = (prefix + suffix).trim();
      const decimals = typeof obj.decimals === "number" ? obj.decimals : decimalsOf(String(value));
      const raw = value.toFixed(decimals);
      const mention = makeComponentMention({
        mdx,
        label,
        value: Number(raw),
        raw,
        unit,
        decimals,
        offset: item.start,
        component: "StatBand",
        location: `StatBand stats[${i}].value`,
      });
      if (mention) out.push({ ...mention, anchorText: label });
    });
  }
  return out;
}

function extractDataTableMentions(mdx: string): StructuredMention[] {
  const out: StructuredMention[] = [];
  for (const tag of scanComponentTags(mdx, "DataTable")) {
    const columnsAttr = tag.attrs.get("columns");
    const rowsAttr = tag.attrs.get("rows");
    if (!columnsAttr || columnsAttr.kind !== "expr" || !rowsAttr || rowsAttr.kind !== "expr") continue;
    const columns = splitTopLevelObjectItems(columnsAttr.text, columnsAttr.start)
      .map((it) => lenientParseObject(it.raw))
      .filter((c): c is Record<string, unknown> => !!c)
      .map((c) => ({
        key: typeof c.key === "string" ? c.key : "",
        label: typeof c.label === "string" ? c.label : (typeof c.key === "string" ? c.key : ""),
        type: typeof c.type === "string" ? c.type : undefined,
      }))
      .filter((c) => c.key !== "");
    const idCol = columns.find((c) => c.type === "string");
    const numCols = columns.filter((c) => c.type === "number");
    if (!idCol || numCols.length === 0) continue;

    const rowItems = splitTopLevelObjectItems(rowsAttr.text, rowsAttr.start);
    for (const item of rowItems) {
      const row = lenientParseObject(item.raw);
      if (!row) continue;
      const idVal = row[idCol.key];
      if (typeof idVal !== "string") continue;
      for (const col of numCols) {
        const parsed = parseNumericCell(row[col.key]);
        if (!parsed) continue;
        const label = `${idVal} ${col.label}`.trim();
        const mention = makeComponentMention({
          mdx,
          label,
          value: parsed.value,
          raw: parsed.raw,
          unit: parsed.unit,
          decimals: parsed.decimals,
          offset: item.start,
          component: "DataTable",
          location: `DataTable rows[].${col.key} (${idVal})`,
        });
        if (mention) {
          out.push({
            ...mention,
            anchorText: idVal,
            disambiguator: numCols.length > 1 ? col.label.toLowerCase().split(/\s+/)[0] : undefined,
          });
        }
      }
    }
  }
  return out;
}

function extractChartMentions(mdx: string): StructuredMention[] {
  const out: StructuredMention[] = [];
  for (const tag of scanComponentTags(mdx, "Chart")) {
    const dataAttr = tag.attrs.get("data");
    const xAttr = tag.attrs.get("x");
    const yAttr = tag.attrs.get("y");
    const yLabelAttr = tag.attrs.get("yLabel");
    if (!dataAttr || dataAttr.kind !== "expr" || !xAttr || xAttr.kind !== "string" || !yAttr || yAttr.kind !== "string")
      continue;
    const xKey = xAttr.text;
    const yKey = yAttr.text;
    const yLabel = yLabelAttr && yLabelAttr.kind === "string" ? yLabelAttr.text : yKey;

    const items = splitTopLevelObjectItems(dataAttr.text, dataAttr.start);
    for (const item of items) {
      const point = lenientParseObject(item.raw);
      if (!point) continue;
      const idVal = point[xKey];
      const val = point[yKey];
      if (typeof idVal !== "string" || typeof val !== "number" || !Number.isFinite(val)) continue;
      const label = `${idVal} ${yLabel}`.trim();
      const raw = String(val);
      const mention = makeComponentMention({
        mdx,
        label,
        value: val,
        raw,
        unit: "",
        decimals: decimalsOf(raw),
        offset: item.start,
        component: "Chart",
        location: `Chart data[].${yKey} (${idVal})`,
      });
      if (mention) out.push({ ...mention, anchorText: idVal });
    }
  }
  return out;
}

// ── Prose anchoring ─────────────────────────────────────────────────────────

interface ProseSpan {
  text: string;
  /** Absolute offset into the original mdx of text[0]. */
  base: number;
}

function extractCaptionSpans(mdx: string): ProseSpan[] {
  const spans: ProseSpan[] = [];
  const re = /\bcaption\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(mdx)) !== null) {
    const text = m[1] ?? m[2] ?? "";
    // group index within the match to compute an absolute base offset.
    const quoteChar = m[1] !== undefined ? '"' : "'";
    const groupStart = m.index + m[0].indexOf(quoteChar) + 1;
    spans.push({ text, base: groupStart });
  }
  return spans;
}

interface ProseCandidate {
  value: number;
  raw: string;
  unit: string;
  decimals: number;
  offset: number;
}

function findAnchoredNumber(
  span: ProseSpan,
  anchorText: string,
  expectedUnit: string,
  expectedDecimals: number,
  disambiguator?: string,
): ProseCandidate | null {
  const haystack = normalizeForMatch(span.text);
  const needle = normalizeForMatch(anchorText);
  const idx = haystack.indexOf(needle);
  if (idx === -1) return null;

  const searchFrom = idx + needle.length;
  let winEnd = searchFrom;
  while (winEnd < span.text.length && winEnd < searchFrom + 160 && !/[.!?\n]/.test(span.text[winEnd]!)) winEnd++;
  let winStart = idx;
  while (winStart > 0 && winStart > idx - 160 && !/[.!?\n]/.test(span.text[winStart - 1]!)) winStart--;

  const windowText = span.text.slice(winStart, winEnd);
  const candidates: ProseCandidate[] = [];
  NUMERIC_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NUMERIC_TOKEN_RE.exec(windowText)) !== null) {
    const before = windowText.slice(Math.max(0, m.index - 20), m.index);
    if (HEDGE_RE.test(before)) continue;
    if (isRangeFollow(windowText, m.index + m[0].length)) continue;
    const raw = m[0];
    const decimals = decimalsOf(raw);
    if (decimals !== expectedDecimals) continue; // different precision class — not a claim of the same figure
    if (!unitCompatibleAfter(windowText, m.index + raw.length, expectedUnit)) continue;
    const value = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    candidates.push({
      value,
      raw,
      unit: expectedUnit,
      decimals,
      offset: span.base + winStart + m.index,
    });
  }
  if (candidates.length === 0) return null;
  if (!disambiguator) return candidates[0]!;
  for (const cand of candidates) {
    const localIdx = cand.offset - span.base - winStart;
    const near = windowText.slice(Math.max(0, localIdx - 30), localIdx + 30).toLowerCase();
    if (near.includes(disambiguator)) return cand;
  }
  return null; // ambiguous among multiple numeric columns — skip (precision-first)
}

function materiallyDifferent(a: number, b: number): boolean {
  if (a === b) return false;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / scale > 0.0005;
}

// ── Top-level check ──────────────────────────────────────────────────────────

/**
 * Flags labeled numeric quantities that disagree with themselves elsewhere in
 * the draft — the exact "one-shot fix left a stale copy" defect class. Pure,
 * deterministic, no network/LLM calls. See module doc for scope/precision notes.
 */
export function checkNumericConsistency(mdx: string): NumericConsistencyFinding[] {
  const structured: StructuredMention[] = [
    ...extractStatBandMentions(mdx),
    ...extractDataTableMentions(mdx),
    ...extractChartMentions(mdx),
  ];
  const findings: NumericConsistencyFinding[] = [];
  const seen = new Set<string>();

  // Pass 1 — cross-component: same normalized label, materially different value.
  const byLabel = new Map<string, StructuredMention[]>();
  for (const m of structured) {
    const arr = byLabel.get(m.normalizedLabel) ?? [];
    arr.push(m);
    byLabel.set(m.normalizedLabel, arr);
  }
  for (const group of byLabel.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        if (a.decimals !== b.decimals) continue;
        if (normalizeUnit(a.unit) !== normalizeUnit(b.unit)) continue;
        if (!materiallyDifferent(a.value, b.value)) continue;
        const key = `${a.location}|${b.location}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({
          label: a.label,
          a,
          b,
          message: `"${a.label}" is ${a.raw}${a.unit} at ${a.location} (line ${a.line}) but ${b.raw}${b.unit} at ${b.location} (line ${b.line})`,
        });
      }
    }
  }

  // Pass 2 — structured value vs. its restatement in prose/captions.
  const proseSpans: ProseSpan[] = [{ text: maskForProse(mdx), base: 0 }, ...extractCaptionSpans(mdx)];
  for (const m of structured) {
    for (const span of proseSpans) {
      const found = findAnchoredNumber(span, m.anchorText, m.unit, m.decimals, m.disambiguator);
      if (!found) continue;
      if (!materiallyDifferent(m.value, found.value)) continue;
      const { line } = lineCol(mdx, found.offset);
      const key = `${m.location}|prose@${found.offset}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const proseMention: NumericMention = {
        label: m.label,
        normalizedLabel: m.normalizedLabel,
        value: found.value,
        raw: found.raw,
        unit: found.unit,
        decimals: found.decimals,
        line,
        source: "prose",
        location: `prose (line ${line})`,
      };
      findings.push({
        label: m.label,
        a: m,
        b: proseMention,
        message: `"${m.label}" is ${m.raw}${m.unit} at ${m.location} (line ${m.line}) but the prose near line ${line} states ${found.raw}${found.unit}`,
      });
    }
  }

  return findings;
}
