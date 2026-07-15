// apps/site/src/components/atlas/methodology-ssr.test.ts
//
// SSR / no-JS fallback tests for the shared Atlas <Methodology> provenance
// panel. Rendered with react-dom/server's renderToStaticMarkup (Node env,
// no jsdom, no client JS) — asserting a complete Provenance fixture produces
// meaningful, honest markup: distinct sourceUrl/methodUrl anchors, both
// licenseTier renderings, and all five Uncertainty discriminants.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { Provenance } from "@khazana/core";
import Methodology from "./Methodology.js";

function baseProvenance(overrides: Partial<Provenance> = {}): Provenance {
  return {
    sourceId: "world-bank-wdi",
    sourceUrl: "https://data.worldbank.org/indicator/NY.GDP.MKTP.CD",
    methodUrl: "https://datahelpdesk.worldbank.org/knowledgebase/articles/906519",
    licenseTier: "redistribute-raw-ok",
    redistribution: true,
    origin: "referenced",
    retrievedAt: "2026-07-01T00:00:00.000Z",
    uncertainty: { kind: "none" },
    ...overrides,
  } as Provenance;
}

test("Methodology SSR renders sourceId, distinct sourceUrl/methodUrl anchors, and retrieval metadata", () => {
  const html = renderToStaticMarkup(createElement(Methodology, { provenance: baseProvenance() }));
  expect(html.length).toBeGreaterThan(0);
  expect(html).toContain("world-bank-wdi");
  // two DISTINCT anchors, never collapsed into one generic link
  expect(html).toContain('href="https://data.worldbank.org/indicator/NY.GDP.MKTP.CD"');
  expect(html).toContain('href="https://datahelpdesk.worldbank.org/knowledgebase/articles/906519"');
  const sourceIdx = html.indexOf("https://data.worldbank.org");
  const methodIdx = html.indexOf("https://datahelpdesk.worldbank.org");
  expect(sourceIdx).toBeGreaterThan(-1);
  expect(methodIdx).toBeGreaterThan(-1);
  expect(sourceIdx).not.toBe(methodIdx);
  // deterministic freshness label derived from retrievedAt (UTC, no relative "x days ago")
  expect(html).toContain("2026");
  expect(html).toContain("UTC");
  // no-JS progressive disclosure via native details/summary
  expect(html).toContain("<details");
  expect(html).toContain("<summary");
});

test("Methodology SSR distinguishes redistribute-raw-ok from derived-only in plain language", () => {
  const raw = renderToStaticMarkup(
    createElement(Methodology, {
      provenance: baseProvenance({ licenseTier: "redistribute-raw-ok", redistribution: true, origin: "referenced" }),
    }),
  );
  expect(raw).toMatch(/redistribut/i);
  expect(raw).not.toMatch(/derived-only/i);

  const derived = renderToStaticMarkup(
    createElement(Methodology, {
      provenance: baseProvenance({
        licenseTier: "derived-only",
        redistribution: false,
        origin: "computed",
        sourceId: "cpi-transparency-international",
      }),
    }),
  );
  expect(derived).toMatch(/derived/i);
  // derived-only content is described as khazana-computed, never as raw redistribution
  expect(derived).toMatch(/comput/i);
  expect(derived).not.toMatch(/raw redistribution permitted|redistribution of raw values permitted/i);
});

test("Methodology SSR renders a raw-OK source's khazana-computed datum as computed, not raw", () => {
  // A raw-OK license tier does NOT imply this particular datum is raw — origin
  // still governs the actual provenance of the value shown.
  const html = renderToStaticMarkup(
    createElement(Methodology, {
      provenance: baseProvenance({ licenseTier: "redistribute-raw-ok", redistribution: false, origin: "computed" }),
    }),
  );
  expect(html).toMatch(/comput/i);
  expect(html).not.toMatch(/raw value redistributed as published/i);
});

test("Methodology SSR: confidenceInterval uncertainty shows bounds and confidence level", () => {
  const html = renderToStaticMarkup(
    createElement(Methodology, {
      provenance: baseProvenance({
        uncertainty: { kind: "confidenceInterval", low: 12.3, high: 18.7, level: 0.95 },
      }),
    }),
  );
  expect(html).toContain("12.3");
  expect(html).toContain("18.7");
  expect(html).toContain("95");
  expect(html).toMatch(/confidence interval/i);
});

test("Methodology SSR: standardError uncertainty shows the SE value", () => {
  const html = renderToStaticMarkup(
    createElement(Methodology, {
      provenance: baseProvenance({ uncertainty: { kind: "standardError", se: 2.1 } }),
    }),
  );
  expect(html).toContain("2.1");
  expect(html).toMatch(/standard error/i);
});

test("Methodology SSR: raterSpread uncertainty shows the range and rater count", () => {
  const html = renderToStaticMarkup(
    createElement(Methodology, {
      provenance: baseProvenance({ uncertainty: { kind: "raterSpread", min: 3, max: 9, raterCount: 12 } }),
    }),
  );
  expect(html).toContain("3");
  expect(html).toContain("9");
  expect(html).toContain("12");
  expect(html).toMatch(/rater/i);
});

test("Methodology SSR: sampleSize uncertainty shows n", () => {
  const html = renderToStaticMarkup(
    createElement(Methodology, {
      provenance: baseProvenance({ uncertainty: { kind: "sampleSize", n: 1204 } }),
    }),
  );
  expect(html).toContain("1,204");
  expect(html).toMatch(/sample size/i);
});

test("Methodology SSR: none uncertainty explicitly says no stated uncertainty, never fabricates a range", () => {
  const html = renderToStaticMarkup(
    createElement(Methodology, { provenance: baseProvenance({ uncertainty: { kind: "none" } }) }),
  );
  expect(html).toMatch(/no stated uncertainty/i);
  // must not accidentally emit a numeric range for the `none` variant
  expect(html).not.toMatch(/confidence interval|standard error|rater spread|sample size/i);
});
