import { expect, test } from "vitest";
import { buildReadsLedger, ReadsLedgerEntrySchema } from "./reads-ledger.js";

// Fixture frontmatters mirroring the shape of apps/site/src/content/blog/*.mdx
// (gray-matter would hand us objects like these; publishedAt may already be a Date).
const CARRINGTON = {
  title: "The Morning the Sky Caught Fire: 1 September 1859",
  format: "chronicle",
  channels: ["science", "history"],
  summary: "A country astronomer sketches a flash on the Sun; seventeen hours later the telegraph network is throwing sparks.",
  publishedAt: "2026-06-27T09:00:00.000Z",
  sources: [
    { title: "Carrington, R. C. (1859). MNRAS 20, 13–15.", url: "https://ui.adsabs.harvard.edu/abs/1859MNRAS..20...13C/abstract" },
    { title: "Tsurutani, B. T. et al. (2003). JGR Space Physics 108, A7.", url: "https://ui.adsabs.harvard.edu/abs/2003JGRA..108.1268T/abstract" },
  ],
  draft: false,
};

const KELLY = {
  title: "The Arithmetic of Ruin: How Much to Bet When You're Right",
  format: "dispatch",
  channels: ["finance", "data-science"],
  summary: "Two gamblers with the identical edge — one compounds a fortune, one goes broke.",
  publishedAt: new Date("2026-06-24T09:00:00.000Z"), // gray-matter often yields a Date
  sources: [{ title: "Kelly, J. L. (1956).", url: "https://archive.org/details/bstj35-4-917" }],
  draft: false,
};

test("buildReadsLedger derives one entry per frontmatter with slug and fields", () => {
  const ledger = buildReadsLedger([
    { slug: "the-carrington-event", frontmatter: CARRINGTON },
    { slug: "the-arithmetic-of-ruin", frontmatter: KELLY },
  ]);
  expect(ledger).toHaveLength(2);
  const carr = ledger.find((e) => e.slug === "the-carrington-event")!;
  expect(carr.title).toBe(CARRINGTON.title);
  expect(carr.format).toBe("chronicle");
  expect(carr.channels).toEqual(["science", "history"]);
  expect(carr.summary).toContain("astronomer");
  // publishedAt normalized to an ISO-8601 string regardless of input form.
  expect(carr.publishedAt).toBe("2026-06-27T09:00:00.000Z");
  // source hostnames become the entity/topic fingerprint for novelty checks.
  expect(carr.sourceTitles.length).toBe(2);
});

test("buildReadsLedger normalizes a Date publishedAt to ISO string", () => {
  const [kelly] = buildReadsLedger([{ slug: "the-arithmetic-of-ruin", frontmatter: KELLY }]);
  expect(kelly!.publishedAt).toBe("2026-06-24T09:00:00.000Z");
});

test("every produced entry validates against ReadsLedgerEntrySchema", () => {
  const ledger = buildReadsLedger([
    { slug: "a", frontmatter: CARRINGTON },
    { slug: "b", frontmatter: KELLY },
  ]);
  for (const entry of ledger) {
    expect(ReadsLedgerEntrySchema.safeParse(entry).success).toBe(true);
  }
});

test("buildReadsLedger sorts newest-first by publishedAt", () => {
  const ledger = buildReadsLedger([
    { slug: "the-arithmetic-of-ruin", frontmatter: KELLY }, // 06-24
    { slug: "the-carrington-event", frontmatter: CARRINGTON }, // 06-27
  ]);
  expect(ledger.map((e) => e.slug)).toEqual(["the-carrington-event", "the-arithmetic-of-ruin"]);
});

test("buildReadsLedger skips frontmatter missing required fields", () => {
  const ledger = buildReadsLedger([
    { slug: "good", frontmatter: CARRINGTON },
    { slug: "bad", frontmatter: { title: "no format or channels" } },
  ]);
  expect(ledger.map((e) => e.slug)).toEqual(["good"]);
});
