// Lightweight MDX/JSX attribute linter — the deterministic backstop that stops a
// draft with broken JSX-attribute syntax from reaching `astro build`.
//
// Why not compile with @mdx-js/mdx? It (plus remark-math/remark-gfm, needed to
// avoid false positives on `$$…$$` math and GFM tables) is not a declared
// dependency of @khazana/generate and only lives in apps/site's dependency
// closure. Pulling three ESM-only packages into this package to run a compile is
// heavier than the failure it guards. Instead we replicate the *one* failure mode
// that keeps slipping through: a straight double-quote (or a backslash-escaped
// quote, `\"`) placed INSIDE a double-quoted JSX attribute value. MDX closes the
// string at the first inner `"`, then chokes on the following text with
// "Unexpected character '\"' in attribute name". The writer fix is always the
// same — inner quotes must be typographic curly quotes (“ ” ‘ ’).
//
// Scope: capitalized component tags only (<Annotation …/>, <Pullquote …>, …) —
// that is exclusively where writers put prose attributes with embedded quotes.
// Expression attributes (`data={[{ date: "x" }]}`), fenced/inline code, and math
// are masked out first so their legal quotes never trip the scanner.

export interface MdxLintIssue {
  /** 1-based line in the ORIGINAL file (frontmatter offset preserved). */
  line: number;
  /** 1-based column. */
  column: number;
  message: string;
}

/** Replace a slice of `s` with spaces, preserving newlines and length/offsets. */
function blank(s: string, start: number, end: number): string {
  let out = s.slice(0, start);
  for (let i = start; i < end; i++) out += s[i] === "\n" ? "\n" : " ";
  return out + s.slice(end);
}

// Mask regions whose quotes/backslashes are legal and must not be scanned as JSX:
// YAML frontmatter, fenced code blocks, and inline code. Math is deliberately NOT
// masked — the scanner only ever starts at a capitalized component tag (`<[A-Z]`),
// which `$…$` / `$$…$$` math never contains, and masking `$…$` would wrongly span
// dollar amounts (`$0.6–2.6 trillion`) across attribute boundaries.
function maskNonJsx(src: string): string {
  let s = src;

  // Frontmatter block at the very top: preserve line numbers by blanking it.
  const fm = s.match(/^---\n[\s\S]*?\n---\n/);
  if (fm) s = blank(s, 0, fm[0].length);

  // Fenced code blocks (``` or ~~~). Line-anchored open/close.
  s = s.replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1?\2[^\n]*$/gm, (m) =>
    m.replace(/[^\n]/g, " "),
  );

  // Inline code spans. Never cross newlines.
  s = s.replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));

  return s;
}

function lineCol(src: string, index: number): { line: number; column: number } {
  let line = 1;
  let last = -1;
  for (let i = 0; i < index; i++) {
    if (src[i] === "\n") {
      line++;
      last = i;
    }
  }
  return { line, column: index - last };
}

const NAME_START = /[A-Za-z_]/;
const NAME_CHAR = /[A-Za-z0-9_:-]/;

/**
 * Scan every capitalized-component opening tag and flag any inner straight quote
 * or backslash-escaped quote inside a double-quoted attribute value. Line/column
 * are reported against the ORIGINAL source (frontmatter offset preserved).
 */
export function lintMdxJsxAttributes(mdx: string): MdxLintIssue[] {
  const masked = maskNonJsx(mdx);
  const issues: MdxLintIssue[] = [];
  const tagStart = /<[A-Z][A-Za-z0-9]*/g;
  let m: RegExpExecArray | null;

  while ((m = tagStart.exec(masked)) !== null) {
    let i = m.index + m[0].length; // just past the tag name
    // Tokenize attributes until the opening tag ends (`>` or `/>`).
    scan: while (i < masked.length) {
      // skip whitespace
      while (i < masked.length && /\s/.test(masked[i]!)) i++;
      if (i >= masked.length) break;
      const c = masked[i]!;
      if (c === ">") break; // opening tag closed
      if (c === "/" && masked[i + 1] === ">") break;
      if (c === "/") {
        i++;
        continue;
      }
      // expect an attribute name here
      if (!NAME_START.test(c)) {
        const { line, column } = lineCol(masked, i);
        issues.push({
          line,
          column,
          message:
            c === '"'
              ? `unescaped double-quote inside a JSX attribute value in <${m[0].slice(1)}> — inner quotes must be typographic curly quotes (“ ” ‘ ’)`
              : `unexpected character \`${c}\` where a JSX attribute name was expected in <${m[0].slice(1)}> (likely an unbalanced attribute quote)`,
        });
        break; // stop scanning this tag; one report per tag is enough
      }
      // read attribute name
      i++;
      while (i < masked.length && NAME_CHAR.test(masked[i]!)) i++;
      // skip whitespace after name
      while (i < masked.length && /\s/.test(masked[i]!)) i++;
      if (masked[i] !== "=") continue; // boolean attribute; next token
      i++;
      while (i < masked.length && /\s/.test(masked[i]!)) i++;
      const v = masked[i];
      if (v === "{") {
        // expression value — skip balanced braces (its quotes are legal JS)
        let depth = 0;
        while (i < masked.length) {
          const ch = masked[i]!;
          if (ch === "{") depth++;
          else if (ch === "}") {
            depth--;
            if (depth === 0) {
              i++;
              break;
            }
          }
          i++;
        }
      } else if (v === '"' || v === "'") {
        // string value — reads to the next matching quote (JSX does NOT honor
        // backslash escapes, so `\"` closes the string early). Flag a backslash
        // that is trying to escape a quote as the tell-tale writer anti-pattern.
        const open = i;
        i++;
        while (i < masked.length && masked[i] !== v && masked[i] !== "\n") {
          if (masked[i] === "\\" && (masked[i + 1] === '"' || masked[i + 1] === "'")) {
            const { line, column } = lineCol(masked, i);
            issues.push({
              line,
              column,
              message: `backslash-escaped quote (\\${masked[i + 1]}) inside a JSX attribute value in <${m[0].slice(1)}> — inner quotes must be typographic curly quotes (“ ” ‘ ’)`,
            });
            break scan;
          }
          i++;
        }
        if (masked[i] !== v) {
          const { line, column } = lineCol(masked, open);
          issues.push({
            line,
            column,
            message: `unterminated JSX attribute string in <${m[0].slice(1)}>`,
          });
          break;
        }
        i++; // consume closing quote
      } else {
        // Unquoted value (or none) — let the next loop iteration classify it.
        continue;
      }
    }
  }

  return issues;
}
