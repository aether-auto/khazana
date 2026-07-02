import { describe, it, expect } from "vitest";
import {
  compileExpr,
  evalCompiled,
  evaluate,
  WHITELIST_FUNCTIONS,
  WHITELIST_CONSTANTS,
} from "./expr-eval.js";

// Small helper: evaluate with an empty var set and expect a numeric value.
function val(src: string, vars: Record<string, number> = {}): number {
  const r = evaluate(src, vars);
  if (!r.ok) throw new Error(`expected ok, got error: ${r.error}`);
  return r.value;
}

describe("basic arithmetic + precedence", () => {
  it("adds and multiplies with correct precedence", () => {
    expect(val("1 + 2 * 3")).toBe(7);
    expect(val("(1 + 2) * 3")).toBe(9);
  });
  it("subtracts and divides left-associatively", () => {
    expect(val("10 - 2 - 3")).toBe(5);
    expect(val("100 / 5 / 2")).toBe(10);
  });
  it("handles nested parentheses", () => {
    expect(val("((2 + 3) * (4 - 1))")).toBe(15);
  });
  it("respects operator precedence across all ops", () => {
    expect(val("2 + 3 * 4 - 6 / 2")).toBe(11);
  });
});

describe("exponentiation", () => {
  it("is right-associative", () => {
    // 2^(3^2) = 2^9 = 512, NOT (2^3)^2 = 64
    expect(val("2 ^ 3 ^ 2")).toBe(512);
  });
  it("binds tighter than * and /", () => {
    expect(val("2 * 3 ^ 2")).toBe(18);
  });
  it("supports the pow() function form too", () => {
    expect(val("pow(2, 10)")).toBe(1024);
  });
});

describe("unary minus / plus", () => {
  it("negates a literal", () => {
    expect(val("-5")).toBe(-5);
    expect(val("3 + -2")).toBe(1);
  });
  it("negates a parenthesized expr", () => {
    expect(val("-(2 + 3)")).toBe(-5);
  });
  it("binds tighter than ^ (spreadsheet convention: -2^2 = 4)", () => {
    expect(val("-2 ^ 2")).toBe(4);
    expect(val("-(2 ^ 2)")).toBe(-4);
  });
  it("stacks unary minus", () => {
    expect(val("--5")).toBe(5);
  });
  it("treats unary plus as a no-op", () => {
    expect(val("+7")).toBe(7);
    expect(val("3 * +2")).toBe(6);
  });
});

describe("numeric literals", () => {
  it("parses decimals and leading-dot decimals", () => {
    expect(val("0.5 + .25")).toBe(0.75);
  });
  it("parses scientific notation", () => {
    expect(val("1e3")).toBe(1000);
    expect(val("2.5e-2")).toBe(0.025);
  });
});

describe("variables", () => {
  it("reads declared variables", () => {
    expect(val("x + y", { x: 3, y: 4 })).toBe(7);
    expect(val("dop * sigma_range", { dop: 2.5, sigma_range: 4 })).toBe(10);
  });
  it("reports the free variables it reads", () => {
    const c = compileExpr("a * x + b", ["a", "b", "x"]);
    expect(c.ok).toBe(true);
    if (c.ok) expect([...c.program.variables].sort()).toEqual(["a", "b", "x"]);
  });
  it("errors when a variable has no value at eval time", () => {
    const c = compileExpr("x + 1", ["x"]);
    expect(c.ok).toBe(true);
    if (c.ok) {
      const r = evalCompiled(c.program, {});
      expect(r.ok).toBe(false);
    }
  });
});

describe("whitelisted functions + constants", () => {
  it("evaluates trig / exp / log", () => {
    expect(val("sin(0)")).toBeCloseTo(0, 10);
    expect(val("cos(0)")).toBe(1);
    expect(val("exp(0)")).toBe(1);
    expect(val("ln(e)", {})).toBeCloseTo(1, 10);
    expect(val("log(100)")).toBeCloseTo(2, 10); // base-10
  });
  it("evaluates sqrt / abs / floor / ceil / round", () => {
    expect(val("sqrt(9)")).toBe(3);
    expect(val("abs(-4)")).toBe(4);
    expect(val("floor(2.9)")).toBe(2);
    expect(val("ceil(2.1)")).toBe(3);
    expect(val("round(2.5)")).toBe(3);
  });
  it("evaluates variadic min / max", () => {
    expect(val("min(3, 1, 2)")).toBe(1);
    expect(val("max(3, 1, 2)")).toBe(3);
    expect(val("min(5, 9)")).toBe(5);
  });
  it("exposes pi and e constants", () => {
    expect(val("pi")).toBeCloseTo(Math.PI, 10);
    expect(val("e")).toBeCloseTo(Math.E, 10);
    expect(val("2 * pi")).toBeCloseTo(2 * Math.PI, 10);
  });
  it("composes functions with expressions", () => {
    expect(val("sqrt(x^2 + y^2)", { x: 3, y: 4 })).toBe(5);
    expect(val("exp(-rate * t)", { rate: 0.5, t: 2 })).toBeCloseTo(Math.exp(-1), 10);
  });
  it("exports the whitelist for docs", () => {
    expect(WHITELIST_FUNCTIONS).toContain("sin");
    expect(WHITELIST_FUNCTIONS).toContain("pow");
    expect(WHITELIST_CONSTANTS).toContain("pi");
    expect(WHITELIST_CONSTANTS).toContain("e");
  });
});

describe("SECURITY: rejects anything outside the sandbox", () => {
  it("rejects unknown identifiers (no access to globals)", () => {
    for (const bad of [
      "window",
      "document",
      "globalThis",
      "process",
      "constructor",
      "__proto__",
      "eval",
      "fetch",
      "self",
      "alert",
    ]) {
      const r = evaluate(bad, {});
      expect(r.ok, `"${bad}" must be rejected`).toBe(false);
    }
  });
  it("rejects unknown function calls", () => {
    const r = evaluate("hack(1)", {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown function/);
  });
  it("rejects a variable it was not told about", () => {
    // `y` is not in the declared var set for this compile.
    const c = compileExpr("x + y", ["x"]);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error).toMatch(/unknown identifier "y"/);
  });
  it("does not treat property-access syntax as valid (no dots)", () => {
    const r = evaluate("Math.PI", {});
    expect(r.ok).toBe(false);
  });
  it("cannot call a whitelisted name as a bare value", () => {
    const r = evaluate("sin", {});
    expect(r.ok).toBe(false);
  });
});

describe("malformed input → safe error (never throws)", () => {
  const bad = [
    "",
    "   ",
    "1 +",
    "* 2",
    "1 2",
    "(1 + 2",
    "1 + 2)",
    "sin()", // wrong arity
    "sin(1, 2)", // wrong arity
    "pow(2)", // wrong arity
    "1 ,, 2",
    "1 @ 2",
    "3 #",
    "()",
    ",",
    "min()",
    "max()",
  ];
  for (const src of bad) {
    it(`"${src}" returns ok:false without throwing`, () => {
      let result: ReturnType<typeof evaluate>;
      expect(() => {
        result = evaluate(src, { x: 1 });
      }).not.toThrow();
      // @ts-expect-error assigned in the closure above
      expect(result.ok).toBe(false);
    });
  }
});

describe("non-finite results are reported, not returned silently", () => {
  it("reports divide-by-zero as an error", () => {
    const r = evaluate("1 / 0", {});
    expect(r.ok).toBe(false);
  });
  it("reports log of a negative as an error", () => {
    const r = evaluate("ln(-1)", {});
    expect(r.ok).toBe(false);
  });
  it("reports sqrt of a negative as an error", () => {
    const r = evaluate("sqrt(-1)", {});
    expect(r.ok).toBe(false);
  });
});

describe("compile-once / eval-many contract", () => {
  it("reuses a compiled program across bindings", () => {
    const c = compileExpr("a * x + b", ["a", "b", "x"]);
    expect(c.ok).toBe(true);
    if (c.ok) {
      expect(evalCompiled(c.program, { a: 2, b: 1, x: 3 })).toEqual({ ok: true, value: 7 });
      expect(evalCompiled(c.program, { a: 2, b: 1, x: 10 })).toEqual({ ok: true, value: 21 });
    }
  });
});
