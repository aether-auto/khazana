/**
 * reflow-inline-mdx.mts
 *
 * Fixes the "own-line inline component" MDX bug: inline phrasing components
 * (Annotation, Sidenote, Definition, Detail, Math) authored ALONE on their own
 * physical line — sandwiched between prose with no blank line — are treated by
 * MDX as FLOW (block) elements, which closes the surrounding <p> and shatters a
 * single paragraph into fragments.
 *
 * The fix: within each maximal run of consecutive non-blank lines, if EVERY line
 * is either prose or a COMPLETE single-line inline component, collapse the run
 * into one physical line (joining fragments with a single space — the same thing
 * a markdown soft-break renders as, which is what keeps the visible text
 * byte-for-byte identical after normalization). Any run that contains a
 * structured/block line (markdown block, opening JSX tag without its close,
 * prop/array line, block component, table, code fence, …) is left UNTOUCHED.
 *
 * Frontmatter and fenced code blocks are never touched.
 *
 * Usage: pnpm tsx scripts/reflow-inline-mdx.mts <file.mdx> [<file2.mdx> ...]
 *        pnpm tsx scripts/reflow-inline-mdx.mts --check <file.mdx>   (report only)
 */

import { readFileSync, writeFileSync } from "node:fs";

const INLINE_COMPS = ["Annotation", "Sidenote", "Definition", "Detail", "Math"];
const INLINE_ALT = INLINE_COMPS.join("|");

// A trimmed line that is exactly ONE complete inline component:
//   self-closing  <Comp ... />
//   or paired      <Comp ...>...</Comp>
const SELF_CLOSING = new RegExp(`^<(${INLINE_ALT})\\b[^<]*/>$`);
const PAIRED = new RegExp(`^<(${INLINE_ALT})\\b[^<]*>.*</(${INLINE_ALT})>$`);

function isBlank(line: string): boolean {
  return line.trim() === "";
}

function isCompleteInline(line: string): boolean {
  const t = line.trim();
  if (SELF_CLOSING.test(t)) return true;
  if (PAIRED.test(t)) {
    // ensure it opens and closes with the SAME component and holds exactly one
    const open = t.match(new RegExp(`^<(${INLINE_ALT})\\b`));
    const close = t.match(new RegExp(`</(${INLINE_ALT})>$`));
    return !!open && !!close && open[1] === close[1];
  }
  return false;
}

// Prose: an ordinary text line with NO structural characters and not starting a
// markdown block. Em-dash (U+2014) is NOT ASCII '-', so appositive lines like
// "— was strategically sound" correctly count as prose.
function isProse(line: string): boolean {
  const t = line.trim();
  if (t === "") return false;
  if (/[<>{}]/.test(t)) return false; // any JSX/expression char ⇒ not plain prose
  if (/^(#{1,6}\s|```|~~~|\||>|[-*+]\s|---$|===$)/.test(t)) return false; // md blocks
  return true;
}

type LineKind = "blank" | "inline" | "prose" | "other";

function classify(line: string): LineKind {
  if (isBlank(line)) return "blank";
  if (isCompleteInline(line)) return "inline";
  if (isProse(line)) return "prose";
  return "other";
}

interface Result {
  text: string;
  changed: boolean;
  runsCollapsed: number;
}

function reflow(source: string): Result {
  const lines = source.split("\n");

  // Locate frontmatter fences (leading --- ... ---) and fenced code blocks so we
  // never touch them.
  const protectedIdx = new Set<number>();
  let i = 0;
  // frontmatter
  if (lines[0]?.trim() === "---") {
    protectedIdx.add(0);
    for (i = 1; i < lines.length; i++) {
      protectedIdx.add(i);
      if (lines[i]?.trim() === "---") {
        i++;
        break;
      }
    }
  }
  // fenced code blocks (``` or ~~~)
  let inFence = false;
  let fenceMarker = "";
  for (let j = i; j < lines.length; j++) {
    const t = lines[j]!.trim();
    if (!inFence && (t.startsWith("```") || t.startsWith("~~~"))) {
      inFence = true;
      fenceMarker = t.slice(0, 3);
      protectedIdx.add(j);
    } else if (inFence) {
      protectedIdx.add(j);
      if (t.startsWith(fenceMarker)) inFence = false;
    }
  }

  const out: string[] = [];
  let runsCollapsed = 0;
  let k = 0;
  while (k < lines.length) {
    if (protectedIdx.has(k) || isBlank(lines[k]!)) {
      out.push(lines[k]!);
      k++;
      continue;
    }
    // gather a maximal run of consecutive, non-protected, non-blank lines
    const run: string[] = [];
    const startK = k;
    while (
      k < lines.length &&
      !protectedIdx.has(k) &&
      !isBlank(lines[k]!)
    ) {
      run.push(lines[k]!);
      k++;
    }

    const kinds = run.map(classify);
    const collapsible =
      run.length > 1 &&
      kinds.every((kd) => kd === "prose" || kd === "inline") &&
      kinds.some((kd) => kd === "inline");

    if (collapsible) {
      out.push(run.map((l) => l.trim()).join(" "));
      runsCollapsed++;
    } else {
      // leave the run exactly as-is
      for (const l of run) out.push(l);
    }
    void startK;
  }

  const text = out.join("\n");
  return { text, changed: text !== source, runsCollapsed };
}

// ---- detector: count remaining "sandwiched" own-line inline components ----
export function countSandwiched(source: string): number {
  const lines = source.split("\n");
  // reuse protection logic minimally: skip frontmatter
  let start = 0;
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]?.trim() === "---") {
        start = i + 1;
        break;
      }
    }
  }
  let count = 0;
  for (let i = start; i < lines.length; i++) {
    if (classify(lines[i]!) !== "inline") continue;
    const prev = i > 0 ? lines[i - 1]! : "";
    const next = i < lines.length - 1 ? lines[i + 1]! : "";
    // "sandwiched" == an own-line inline component with a non-blank neighbour
    // that is prose or another inline (i.e. it split a paragraph)
    const prevBad = !isBlank(prev) && (classify(prev) === "prose" || classify(prev) === "inline");
    const nextBad = !isBlank(next) && (classify(next) === "prose" || classify(next) === "inline");
    if (prevBad || nextBad) count++;
  }
  return count;
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const files = args.filter((a) => a !== "--check");
  if (files.length === 0) {
    console.error("usage: reflow-inline-mdx.mts [--check] <file.mdx> ...");
    process.exit(2);
  }
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const before = countSandwiched(src);
    const { text, changed, runsCollapsed } = reflow(src);
    const after = countSandwiched(text);
    if (checkOnly) {
      console.log(`${f}: sandwiched=${before} (check only, no write)`);
      continue;
    }
    if (changed) writeFileSync(f, text);
    console.log(
      `${f}: runs collapsed=${runsCollapsed}, sandwiched before=${before} after=${after}, written=${changed}`
    );
  }
}

// run main only when invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
