// apps/site/src/components/mdx/lib/expr-eval.ts
//
// A TINY, SANDBOXED arithmetic-expression evaluator for AUTHOR-supplied formula
// strings that run in the READER's page (the <ParameterPlay> island). The whole
// reason this file exists is SECURITY: the `expr` / `readouts[].expr` props are
// author strings, and evaluating them with `eval` / `new Function` would hand
// the author (or anyone who could inject an author string) full access to the
// reader's `window`, `document`, cookies, network — an XSS primitive. So we do
// NOT use `eval`/`new Function` anywhere. Instead we:
//
//   1. TOKENIZE the string with a small hand-rolled lexer (numbers, identifiers,
//      operators, parens, commas) — anything unrecognised is a hard error.
//   2. PARSE to Reverse-Polish Notation via the shunting-yard algorithm, honoring
//      precedence, right-assoc `^`, unary minus, parentheses, and function calls.
//   3. EVALUATE the RPN against a *plain object* of variable bindings and a fixed,
//      frozen WHITELIST of math functions/constants. Identifiers not in the
//      variable set or the whitelist are REJECTED — there is no path to a global.
//
// Nothing here touches the DOM, `globalThis`, prototypes, or `this`. The only
// callable things are the pure numeric functions in FUNCTIONS below. Parsing is
// separated from evaluation so an author's formula is compiled ONCE (validated,
// its free variables discovered) and then evaluated cheaply on every slider tick.
//
// Grammar (EBNF-ish):
//   expr    := term (("+" | "-") term)*
//   term    := factor (("*" | "/") factor)*
//   factor  := unary ("^" factor)?          // ^ is right-associative
//   unary   := ("-" | "+")* primary
//   primary := number | ident | ident "(" args ")" | "(" expr ")"
//   args    := expr ("," expr)*
// (The shunting-yard below encodes exactly this precedence/associativity.)

/** A parsed, reusable program. Compile once, evaluate many times. */
export interface CompiledExpr {
  /** RPN token stream ready for the stack machine. */
  readonly rpn: readonly RpnToken[];
  /** Free variable names the formula reads (excludes whitelisted funcs/consts). */
  readonly variables: readonly string[];
  /** The original source, for error messages. */
  readonly source: string;
}

export type EvalResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

export type CompileResult =
  | { ok: true; program: CompiledExpr }
  | { ok: false; error: string };

// ── Whitelist: the ONLY functions/constants an author formula may name ──────────
// Every entry is a pure numeric function or a numeric literal. Frozen so a
// compromised import can't extend the surface at runtime. `pow` is provided in
// addition to the `^` operator for authors who prefer the call form.
const FUNCTIONS: Readonly<Record<string, (...a: number[]) => number>> = Object.freeze({
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  exp: Math.exp,
  // `log` is base-10 (matches most scientific-calculator conventions); `ln` is natural.
  log: Math.log10,
  ln: Math.log,
  sqrt: Math.sqrt,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
});

const CONSTANTS: Readonly<Record<string, number>> = Object.freeze({
  pi: Math.PI,
  e: Math.E,
});

// Arity for whitelisted functions. `min`/`max` are variadic (>= 1).
const ARITY: Readonly<Record<string, number | "variadic">> = Object.freeze({
  sin: 1, cos: 1, tan: 1, exp: 1, log: 1, ln: 1, sqrt: 1, abs: 1,
  floor: 1, ceil: 1, round: 1, pow: 2, min: "variadic", max: "variadic",
});

// ── Tokens ──────────────────────────────────────────────────────────────────
type Tok =
  | { t: "num"; v: number }
  | { t: "ident"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "^" }
  | { t: "lparen" }
  | { t: "rparen" }
  | { t: "comma" };

type RpnToken =
  | { t: "num"; v: number }
  | { t: "var"; v: string }
  | { t: "const"; v: number }
  | { t: "op"; v: string; unary?: boolean }
  | { t: "call"; name: string; argc: number };

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*/;
const NUM_RE = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;

function tokenize(src: string): { ok: true; toks: Tok[] } | { ok: false; error: string } {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "(") { toks.push({ t: "lparen" }); i++; continue; }
    if (c === ")") { toks.push({ t: "rparen" }); i++; continue; }
    if (c === ",") { toks.push({ t: "comma" }); i++; continue; }
    if (c === "+" || c === "-" || c === "*" || c === "/" || c === "^") {
      toks.push({ t: "op", v: c });
      i++;
      continue;
    }
    const rest = src.slice(i);
    // A number: digits with optional fraction/exponent. Try number BEFORE ident
    // so `1e3` lexes as one number, not `1` `e3`.
    const numM = NUM_RE.exec(rest);
    if (numM && (c === "." || (c >= "0" && c <= "9"))) {
      const raw = numM[0];
      const v = Number(raw);
      if (!Number.isFinite(v)) return { ok: false, error: `invalid number "${raw}"` };
      toks.push({ t: "num", v });
      i += raw.length;
      continue;
    }
    const idM = IDENT_RE.exec(rest);
    if (idM) {
      toks.push({ t: "ident", v: idM[0] });
      i += idM[0].length;
      continue;
    }
    return { ok: false, error: `unexpected character "${c}" at position ${i}` };
  }
  return { ok: true, toks };
}

function opInfo(op: string, unary: boolean): { prec: number; rightAssoc: boolean } {
  if (unary) return { prec: 5, rightAssoc: true }; // unary minus binds tighter than ^? No — see note.
  switch (op) {
    case "+":
    case "-":
      return { prec: 2, rightAssoc: false };
    case "*":
    case "/":
      return { prec: 3, rightAssoc: false };
    case "^":
      return { prec: 4, rightAssoc: true };
    default:
      return { prec: 0, rightAssoc: false };
  }
}
// Note on unary minus precedence: we give it prec 5 (above `^`) so `-2^2` parses
// as `(-2)^2 = 4`. This is a deliberate, documented choice (matches spreadsheet
// convention). Authors who want `-(2^2)` write it explicitly.

/**
 * Compile an author formula to RPN once. Discovers free variables. On any
 * malformed input (bad char, unbalanced parens, unknown function, wrong arity,
 * unknown identifier that is neither a declared variable nor a whitelist const)
 * returns `{ ok:false, error }` — NEVER throws to the caller and NEVER evaluates.
 *
 * @param source     the author expression
 * @param varNames   the set of legal free-variable identifiers (param keys + xVar)
 */
export function compileExpr(source: string, varNames: readonly string[]): CompileResult {
  if (typeof source !== "string" || source.trim() === "") {
    return { ok: false, error: "empty expression" };
  }
  const lexed = tokenize(source);
  if (!lexed.ok) return { ok: false, error: lexed.error };
  const toks = lexed.toks;
  const varSet = new Set(varNames);

  const output: RpnToken[] = [];
  const readVars = new Set<string>();
  // Operator stack holds ops, unary marker, function markers, and paren markers.
  type StackItem =
    | { k: "op"; v: string; unary: boolean }
    | { k: "lparen" }
    | { k: "func"; name: string }
    | { k: "argsep-sentinel" };
  const stack: StackItem[] = [];
  // Track argument counts per open function call.
  const argCounts: number[] = [];
  // Whether the previous token allows a following value (vs. an operator). Used
  // to distinguish unary from binary minus.
  let expectValue = true;

  function popWhile(pred: (it: StackItem) => boolean): boolean {
    while (stack.length > 0 && pred(stack[stack.length - 1]!)) {
      const it = stack.pop()!;
      if (it.k === "op") {
        output.push({ t: "op", v: it.v, unary: it.unary });
      } else {
        // a non-op popped by mistake: caller guards, but be safe.
        return false;
      }
    }
    return true;
  }

  for (let idx = 0; idx < toks.length; idx++) {
    const tk = toks[idx]!;
    switch (tk.t) {
      case "num": {
        output.push({ t: "num", v: tk.v });
        expectValue = false;
        break;
      }
      case "ident": {
        const name = tk.v;
        const isCall = idx + 1 < toks.length && toks[idx + 1]!.t === "lparen";
        if (isCall) {
          if (!(name in FUNCTIONS)) {
            return { ok: false, error: `unknown function "${name}"` };
          }
          stack.push({ k: "func", name });
          // The lparen that follows will be consumed on the next iteration; we
          // seed an arg counter now (0 args until we see the first value).
          argCounts.push(0);
          expectValue = true;
        } else {
          if (name in CONSTANTS) {
            output.push({ t: "const", v: CONSTANTS[name]! });
          } else if (varSet.has(name)) {
            readVars.add(name);
            output.push({ t: "var", v: name });
          } else if (name in FUNCTIONS) {
            return { ok: false, error: `function "${name}" used without arguments` };
          } else {
            return { ok: false, error: `unknown identifier "${name}"` };
          }
          expectValue = false;
        }
        break;
      }
      case "op": {
        const unary = expectValue; // a value was expected → this +/- is unary
        if (unary && tk.v !== "+" && tk.v !== "-") {
          return { ok: false, error: `unexpected operator "${tk.v}"` };
        }
        if (unary && tk.v === "+") {
          // unary plus is a no-op; skip emitting it.
          expectValue = true;
          break;
        }
        const info = opInfo(tk.v, unary);
        // Pop operators of higher precedence (or equal, if left-assoc).
        popWhile((it) => {
          if (it.k !== "op") return false;
          const o2 = opInfo(it.v, it.unary);
          return o2.prec > info.prec || (o2.prec === info.prec && !info.rightAssoc);
        });
        stack.push({ k: "op", v: tk.v === "+" ? "+" : tk.v, unary });
        expectValue = true;
        break;
      }
      case "lparen": {
        stack.push({ k: "lparen" });
        expectValue = true;
        break;
      }
      case "comma": {
        // Pop to the nearest lparen; bump the enclosing function's arg count.
        let sawLparen = false;
        while (stack.length > 0) {
          const top = stack[stack.length - 1]!;
          if (top.k === "lparen") { sawLparen = true; break; }
          if (top.k === "op") { output.push({ t: "op", v: top.v, unary: top.unary }); stack.pop(); }
          else break;
        }
        if (!sawLparen || argCounts.length === 0) {
          return { ok: false, error: "misplaced comma (outside a function call)" };
        }
        argCounts[argCounts.length - 1]!++;
        expectValue = true;
        break;
      }
      case "rparen": {
        let sawLparen = false;
        while (stack.length > 0) {
          const top = stack[stack.length - 1]!;
          if (top.k === "lparen") { stack.pop(); sawLparen = true; break; }
          if (top.k === "op") { output.push({ t: "op", v: top.v, unary: top.unary }); stack.pop(); }
          else break;
        }
        if (!sawLparen) return { ok: false, error: "unbalanced parenthesis" };
        // If a function marker sits atop the stack, this was a call.
        if (stack.length > 0 && stack[stack.length - 1]!.k === "func") {
          const fn = stack.pop() as { k: "func"; name: string };
          const seededArgs = argCounts.pop() ?? 0;
          // seededArgs counts commas; total args = commas + 1, unless the call
          // was empty `f()` (no value emitted → 0 args).
          const empty = expectValue === true && seededArgs === 0 && isEmptyCall(idx, toks);
          const argc = empty ? 0 : seededArgs + 1;
          const want = ARITY[fn.name];
          if (want === "variadic") {
            if (argc < 1) return { ok: false, error: `"${fn.name}" needs at least 1 argument` };
          } else if (typeof want === "number" && argc !== want) {
            return { ok: false, error: `"${fn.name}" expects ${want} argument(s), got ${argc}` };
          }
          output.push({ t: "call", name: fn.name, argc });
        }
        expectValue = false;
        break;
      }
    }
  }

  // Drain remaining operators.
  while (stack.length > 0) {
    const it = stack.pop()!;
    if (it.k === "lparen") return { ok: false, error: "unbalanced parenthesis" };
    if (it.k === "func") return { ok: false, error: "unclosed function call" };
    if (it.k === "op") output.push({ t: "op", v: it.v, unary: it.unary });
  }

  if (output.length === 0) return { ok: false, error: "empty expression" };

  // Validate the RPN forms exactly one value (catches "1 2", "1 +", etc.).
  const depth = rpnStackDepth(output);
  if (depth.ok !== true) return { ok: false, error: depth.error };

  return {
    ok: true,
    program: { rpn: output, variables: [...readVars], source },
  };
}

// Detect the `f()` empty-call shape: the token right before the closing paren is
// the opening paren of THIS call.
function isEmptyCall(rparenIdx: number, toks: Tok[]): boolean {
  return rparenIdx >= 1 && toks[rparenIdx - 1]!.t === "lparen";
}

// A dry-run of the stack machine that only tracks depth — verifies the program
// is well-formed (leaves exactly one result) before we ever run it with numbers.
function rpnStackDepth(rpn: readonly RpnToken[]): { ok: true } | { ok: false; error: string } {
  let depth = 0;
  for (const tk of rpn) {
    if (tk.t === "num" || tk.t === "var" || tk.t === "const") depth += 1;
    else if (tk.t === "op") {
      if (tk.unary) {
        if (depth < 1) return { ok: false, error: "malformed expression" };
      } else {
        if (depth < 2) return { ok: false, error: "malformed expression" };
        depth -= 1;
      }
    } else if (tk.t === "call") {
      if (depth < tk.argc) return { ok: false, error: "malformed expression" };
      depth -= tk.argc;
      depth += 1;
    }
  }
  if (depth !== 1) return { ok: false, error: "malformed expression" };
  return { ok: true };
}

/**
 * Evaluate a compiled program against variable bindings. Pure: reads only `vars`,
 * FUNCTIONS, CONSTANTS. Returns a numeric result or a safe error (never throws,
 * never returns NaN silently — NaN/Infinity are reported so the caller can skip
 * that sample rather than plot a broken point).
 */
export function evalCompiled(
  program: CompiledExpr,
  vars: Readonly<Record<string, number>>,
): EvalResult {
  const st: number[] = [];
  for (const tk of program.rpn) {
    switch (tk.t) {
      case "num":
        st.push(tk.v);
        break;
      case "const":
        st.push(tk.v);
        break;
      case "var": {
        const val = vars[tk.v];
        if (typeof val !== "number") {
          return { ok: false, error: `variable "${tk.v}" has no value` };
        }
        st.push(val);
        break;
      }
      case "op": {
        if (tk.unary) {
          const a = st.pop();
          if (a === undefined) return { ok: false, error: "stack underflow" };
          st.push(tk.v === "-" ? -a : a);
        } else {
          const b = st.pop();
          const a = st.pop();
          if (a === undefined || b === undefined) return { ok: false, error: "stack underflow" };
          st.push(applyBinary(tk.v, a, b));
        }
        break;
      }
      case "call": {
        const fn = FUNCTIONS[tk.name];
        if (!fn) return { ok: false, error: `unknown function "${tk.name}"` };
        const args: number[] = new Array(tk.argc);
        for (let k = tk.argc - 1; k >= 0; k--) {
          const v = st.pop();
          if (v === undefined) return { ok: false, error: "stack underflow" };
          args[k] = v;
        }
        st.push(fn(...args));
        break;
      }
    }
  }
  if (st.length !== 1) return { ok: false, error: "malformed expression" };
  const result = st[0]!;
  if (!Number.isFinite(result)) {
    return { ok: false, error: "result is not a finite number" };
  }
  return { ok: true, value: result };
}

function applyBinary(op: string, a: number, b: number): number {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return a / b;
    case "^": return a ** b;
    default: return NaN;
  }
}

/**
 * Convenience: compile + evaluate in one shot (used by tests + one-off calls).
 * For the live island you should `compileExpr` ONCE and reuse `evalCompiled`.
 */
export function evaluate(
  source: string,
  vars: Readonly<Record<string, number>>,
): EvalResult {
  const c = compileExpr(source, Object.keys(vars));
  if (!c.ok) return { ok: false, error: c.error };
  return evalCompiled(c.program, vars);
}

/** The whitelisted function names, exported for docs/tests. */
export const WHITELIST_FUNCTIONS = Object.freeze(Object.keys(FUNCTIONS));
/** The whitelisted constant names, exported for docs/tests. */
export const WHITELIST_CONSTANTS = Object.freeze(Object.keys(CONSTANTS));
