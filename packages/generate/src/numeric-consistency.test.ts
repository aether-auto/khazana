import { expect, test } from "vitest";
import { checkNumericConsistency } from "./numeric-consistency.js";

function draft(body: string): string {
  return `---
title: "Test"
format: dispatch
channels:
  - ai
summary: "s"
publishedAt: 2026-06-23T00:00:00.000Z
sources:
  - { title: "One", url: "https://e.com/1" }
---
${body}
`;
}

test("a draft with matching numbers everywhere passes (no findings)", () => {
  const body = `<StatBand
  caption="Peak throughput"
  stats={[
    { value: 989, decimals: 0, suffix: " TFLOPS", label: "H100 peak BF16 (dense)" }
  ]}
/>

The H100 peak BF16 (dense) throughput is 989 TFLOPS, astonishing for its era.
`;
  const findings = checkNumericConsistency(draft(body));
  expect(findings).toEqual([]);
});

test("a DataTable cell contradicts a prose restatement of the same labeled quantity (the killer defect)", () => {
  const body = `<DataTable
  caption="Casualty figures by theater."
  columns={[
    { key: "country", label: "Country", type: "string" },
    { key: "casualties", label: "Casualties", type: "number" }
  ]}
  rows={[
    { country: "France", casualties: "3,255" }
  ]}
/>

Historians estimate France suffered 3,231 casualties in the campaign, a staggering toll.
`;
  const findings = checkNumericConsistency(draft(body));
  expect(findings.length).toBeGreaterThanOrEqual(1);
  const f = findings[0]!;
  expect(f.a.raw + f.a.unit === "3,255" || f.b.raw + f.b.unit === "3,255").toBe(true);
  expect(f.a.raw + f.a.unit === "3,231" || f.b.raw + f.b.unit === "3,231").toBe(true);
});

test("two components restating the same series with a different value are flagged", () => {
  const body = `<StatBand
  caption="Correlation, first mention"
  stats={[
    { value: 0.31, decimals: 2, label: "model correlation coefficient" }
  ]}
/>

Some connective prose between the two figures.

<StatBand
  caption="Correlation, restated later"
  stats={[
    { value: 0.29, decimals: 2, label: "model correlation coefficient" }
  ]}
/>
`;
  const findings = checkNumericConsistency(draft(body));
  expect(findings.some((f) => f.label.toLowerCase().includes("model correlation coefficient"))).toBe(true);
});

test("unrelated numbers for genuinely different quantities are NOT flagged (precision)", () => {
  const body = `<StatBand
  caption="Two different things"
  stats={[
    { value: 989, decimals: 0, suffix: " TFLOPS", label: "H100 peak BF16 (dense)" },
    { value: 3.35, decimals: 2, suffix: " TB/s", label: "HBM3 memory bandwidth" }
  ]}
/>

The chip ships in volume of 40,000 units this quarter, and separately the ridge point sits at 295 FLOP/byte.
`;
  const findings = checkNumericConsistency(draft(body));
  expect(findings).toEqual([]);
});

test("percentages: same-unit contradiction is flagged; mismatched units are not compared", () => {
  const flagged = `<StatBand
  caption="Conversion"
  stats={[
    { value: 12, decimals: 0, suffix: "%", label: "signup conversion rate" }
  ]}
/>

The signup conversion rate sits at 9%, well below plan.
`;
  const findingsFlagged = checkNumericConsistency(draft(flagged));
  expect(findingsFlagged.length).toBeGreaterThanOrEqual(1);

  const notFlagged = `<StatBand
  caption="Conversion"
  stats={[
    { value: 12, decimals: 0, suffix: "%", label: "signup conversion rate" }
  ]}
/>

The signup conversion rate metric feeds into 12 downstream dashboards.
`;
  const findingsNotFlagged = checkNumericConsistency(draft(notFlagged));
  expect(findingsNotFlagged).toEqual([]);
});

test("hedged/approximate prose numbers are not flagged as contradictions", () => {
  const body = `<StatBand
  caption="Headcount"
  stats={[
    { value: 3255, decimals: 0, label: "wartime headcount" }
  ]}
/>

The wartime headcount was roughly 3,000 at its peak, according to the memoir.
`;
  const findings = checkNumericConsistency(draft(body));
  expect(findings).toEqual([]);
});

test("a draft with no known components produces no findings (no crash on plain prose)", () => {
  const findings = checkNumericConsistency(draft("Just some plain prose with a 1959 date and 42 widgets."));
  expect(findings).toEqual([]);
});

test("findings carry line numbers usable by a fix-writer", () => {
  const body = `<StatBand
  caption="Peak"
  stats={[
    { value: 989, decimals: 0, suffix: " TFLOPS", label: "H100 peak dense throughput" }
  ]}
/>

The H100 peak dense throughput is actually 750 TFLOPS in this retelling.
`;
  const findings = checkNumericConsistency(draft(body));
  expect(findings.length).toBeGreaterThanOrEqual(1);
  expect(findings[0]!.a.line).toBeGreaterThan(0);
  expect(findings[0]!.b.line).toBeGreaterThan(0);
});
