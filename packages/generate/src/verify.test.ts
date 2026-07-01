import { expect, test } from "vitest";
import type { CitationLedger, FeedItem } from "@khazana/core";
import { runVerify, type FactChecker } from "./verify.js";

function item(id: string, url: string): FeedItem {
  return {
    id, source: "s", sourceType: "rss", url, title: id,
    publishedAt: "2026-06-22T00:00:00.000Z", fetchedAt: "2026-06-22T00:00:00.000Z",
    topics: ["ai"], entities: [], summary: "", media: [], kind: "link",
  };
}

const curated = [item("s1", "https://e.com/1")];

const GOOD = `---
title: "Good Post"
format: dispatch
channels:
  - ai
summary: "ok"
publishedAt: 2026-06-23T00:00:00.000Z
sources:
  - { title: "One", url: "https://e.com/1" }
---
<Chart />
`;

const BAD = `---
title: "Bad Post"
format: dispatch
channels:
  - ai
summary: "ok"
publishedAt: 2026-06-23T00:00:00.000Z
sources:
  - { title: "Made up", url: "https://nope.example/x" }
---
Body.
`;

test("runVerify passes good drafts and fails ungrounded ones", async () => {
  const report = await runVerify(
    [{ file: "/x/good.mdx", mdx: GOOD }, { file: "/x/bad.mdx", mdx: BAD }],
    curated,
    { now: "2026-06-23T00:00:00.000Z" },
  );
  expect(report.ok).toBe(false);
  expect(report.drafts.find((d) => d.file.endsWith("good.mdx"))!.ok).toBe(true);
  expect(report.drafts.find((d) => d.file.endsWith("bad.mdx"))!.ok).toBe(false);
});

// A draft citing a RESEARCHED (non-curated) high-tier source: the Carrington case.
const RESEARCHED = `---
title: "The Carrington Event"
format: chronicle
channels:
  - history
summary: "The 1859 solar storm."
publishedAt: 2026-06-23T00:00:00.000Z
sources:
  - { title: "MNRAS 1859", url: "https://academic.oup.com/mnras/1859" }
---
<Timeline />
`;

test("a draft citing a researched (non-curated) ledger source PASSES", async () => {
  const ledger: CitationLedger = [
    { url: "https://academic.oup.com/mnras/1859", title: "MNRAS 1859", tier: "high", origin: "researched" },
  ];
  const report = await runVerify([{ file: "/x/carrington.mdx", mdx: RESEARCHED }], curated, {
    now: "2026-06-23T00:00:00.000Z",
    ledger,
  });
  expect(report.drafts[0]!.ok).toBe(true);
  expect(report.drafts[0]!.errors).toEqual([]);
});

test("a draft citing a source in NEITHER curated NOR ledger FAILS grounding", async () => {
  const ledger: CitationLedger = [
    { url: "https://academic.oup.com/mnras/1859", title: "MNRAS 1859", tier: "high", origin: "researched" },
  ];
  const report = await runVerify([{ file: "/x/bad.mdx", mdx: BAD }], curated, {
    now: "2026-06-23T00:00:00.000Z",
    ledger,
  });
  expect(report.drafts[0]!.ok).toBe(false);
  expect(report.drafts[0]!.errors.join(" ")).toMatch(/ground/i);
});

test("curated urls remain grounded even without an explicit ledger", async () => {
  const report = await runVerify([{ file: "/x/good.mdx", mdx: GOOD }], curated, {
    now: "2026-06-23T00:00:00.000Z",
  });
  expect(report.drafts[0]!.ok).toBe(true);
});

test("factChecker is off by default and runs only when injected", async () => {
  const checker: FactChecker = async () => ({ ok: false, notes: "claim unsupported" });
  const report = await runVerify([{ file: "/x/good.mdx", mdx: GOOD }], curated, {
    now: "2026-06-23T00:00:00.000Z",
    factChecker: checker,
  });
  const d = report.drafts[0]!;
  expect(d.factCheck).toEqual({ ok: false, notes: "claim unsupported" });
  expect(d.ok).toBe(false); // a failing fact-check fails the draft

  const noChecker = await runVerify([{ file: "/x/good.mdx", mdx: GOOD }], curated, {
    now: "2026-06-23T00:00:00.000Z",
  });
  expect(noChecker.drafts[0]!.factCheck).toBeUndefined();
  expect(noChecker.drafts[0]!.ok).toBe(true);
});
