import { UncertaintySchema, type Uncertainty } from "@khazana/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import UncertaintyStrip from "./UncertaintyStrip.js";

const CASES: ReadonlyArray<{
  name: string;
  uncertainty: Uncertainty;
  expectsRange: boolean;
  expectedRange?: { low: string; mid: string; high: string };
  score: number;
  sampleCount: number;
}> = [
  {
    name: "confidence interval",
    uncertainty: UncertaintySchema.parse({ kind: "confidenceInterval", low: 42, high: 58, level: 0.95 }),
    expectsRange: true,
    expectedRange: { low: "42", mid: "50", high: "58" },
    score: 50,
    sampleCount: 240,
  },
  {
    name: "standard error",
    uncertainty: UncertaintySchema.parse({ kind: "standardError", se: 2.5 }),
    expectsRange: true,
    expectedRange: { low: "45.1", mid: "50", high: "54.9" },
    score: 50,
    sampleCount: 240,
  },
  {
    name: "rater spread",
    uncertainty: UncertaintySchema.parse({ kind: "raterSpread", min: 38, max: 63, raterCount: 8 }),
    expectsRange: true,
    expectedRange: { low: "38", mid: "50", high: "63" },
    score: 50,
    sampleCount: 240,
  },
  {
    name: "sample size",
    uncertainty: UncertaintySchema.parse({ kind: "sampleSize", n: 1_204 }),
    expectsRange: false,
    score: 50,
    sampleCount: 240,
  },
  {
    name: "none",
    uncertainty: UncertaintySchema.parse({ kind: "none" }),
    expectsRange: false,
    score: 50,
    sampleCount: 240,
  },
];

test.each(CASES)("UncertaintyStrip SSR renders $name with the correct static readout", ({
  uncertainty,
  expectsRange,
  expectedRange,
  score,
  sampleCount,
}) => {
  const html = renderToStaticMarkup(
    createElement(UncertaintyStrip, { score, uncertainty, n: sampleCount, label: "Reliability" }),
  );

  expect(html).toContain(`n=${sampleCount}`);
  expect(html).toContain('href="/atlas/bias-lab/methodology#icr-floor"');

  if (expectsRange) {
    if (!expectedRange) throw new Error("range fixture needs expected low, mid, and high values");
    expect(html).toContain('data-uncertainty-range="true"');
    expect(html).toContain("<svg");
    expect(html).toContain("data-uncertainty-low");
    expect(html).toContain("data-uncertainty-mid");
    expect(html).toContain("data-uncertainty-high");
    expect(html).toContain(`low ${expectedRange.low}`);
    expect(html).toContain(`mid ${expectedRange.mid}`);
    expect(html).toContain(`high ${expectedRange.high}`);
  } else {
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("data-uncertainty-range");
    expect(html).not.toContain("data-uncertainty-low");
    expect(html).not.toContain("data-uncertainty-mid");
    expect(html).not.toContain("data-uncertainty-high");
    expect(html).not.toContain("low ");
    expect(html).not.toContain("mid ");
    expect(html).not.toContain("high ");
  }

  if (uncertainty.kind === "sampleSize") {
    expect(html).toContain('data-uncertainty-sample-size="true"');
    expect(html).toContain(`n=${uncertainty.n}`);
  }

  if (uncertainty.kind === "none") {
    expect(html).toContain("no uncertainty reported");
  }
});
