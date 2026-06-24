import { expect, test } from "vitest";
import { AUTO_ADD_TRUST, QUEUE_TRUST, computeTrust, evaluateCandidate } from "./evaluate.js";
import type { Candidate } from "./io.js";
import type { Registry } from "@khazana/core";

const registry: Registry = {
  version: 1,
  sources: [
    { id: "qm", type: "rss", url: "https://www.quantamagazine.org/feed/", channels: ["science"], enabled: true, trustScore: 0.8, addedBy: "seed", failureCount: 0 },
  ],
};

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  url: "https://newblog.example.com",
  title: "New Blog",
  channels: ["ai", "tech"],
  ...over,
});

test("thresholds are the documented constants", () => {
  expect(AUTO_ADD_TRUST).toBe(0.7);
  expect(QUEUE_TRUST).toBe(0.4);
});

test("computeTrust clamps claimedTrust and nudges https, deterministic", () => {
  expect(computeTrust(cand({ url: "http://x.com", claimedTrust: 0.6 }))).toBeCloseTo(0.6);
  expect(computeTrust(cand({ url: "https://x.com", claimedTrust: 0.6 }))).toBeCloseTo(0.65);
  expect(computeTrust(cand({ url: "https://x.com", claimedTrust: 5 }))).toBe(1); // clamped
  expect(computeTrust(cand({ url: "https://x.com" }))).toBeCloseTo(0.55); // default 0.5 + https
});

test("add: high trust, feed present, not duplicate, valid channels", () => {
  const v = evaluateCandidate(cand({ claimedTrust: 0.9 }), "https://newblog.example.com/feed.xml", registry);
  expect(v.decision).toBe("add");
  expect(v.hasFeed).toBe(true);
  expect(v.duplicate).toBe(false);
  expect(v.channels).toEqual(["ai", "tech"]);
});

test("queue: borderline trust between QUEUE and AUTO_ADD", () => {
  const v = evaluateCandidate(cand({ url: "http://x.example.com", claimedTrust: 0.5 }), "https://x.example.com/feed", registry);
  expect(v.decision).toBe("queue");
  expect(v.reason).toBe("queue-review");
});

test("reject: no feed discovered", () => {
  const v = evaluateCandidate(cand({ claimedTrust: 0.9 }), null, registry);
  expect(v.decision).toBe("reject");
  expect(v.reason).toBe("no-feed");
});

test("reject: duplicate domain (candidate or feed domain already a source)", () => {
  const v = evaluateCandidate(
    cand({ url: "https://www.quantamagazine.org/", claimedTrust: 0.9 }),
    "https://www.quantamagazine.org/feed/",
    registry,
  );
  expect(v.decision).toBe("reject");
  expect(v.duplicate).toBe(true);
  expect(v.reason).toBe("duplicate");
});

test("reject: all channels unknown are dropped → no valid channels", () => {
  const v = evaluateCandidate(cand({ channels: ["not-a-channel", "also-bad"], claimedTrust: 0.9 }), "https://newblog.example.com/feed.xml", registry);
  expect(v.channels).toEqual([]);
  expect(v.decision).toBe("reject");
  expect(v.reason).toBe("no-valid-channels");
});

test("reject: feed present but trust below QUEUE_TRUST", () => {
  const v = evaluateCandidate(cand({ url: "http://low.example.com", claimedTrust: 0.2 }), "https://low.example.com/feed", registry);
  expect(v.decision).toBe("reject");
  expect(v.reason).toBe("low-trust");
});
