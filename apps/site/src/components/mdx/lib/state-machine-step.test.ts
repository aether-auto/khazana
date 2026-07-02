// apps/site/src/components/mdx/lib/state-machine-step.test.ts
import { describe, expect, test } from "vitest";
import {
  type SMTransition,
  initialStep,
  resolveSequence,
  matchTransitionRef,
  outgoing,
  stepSequence,
  fireTransition,
  isComplete,
  appendUnique,
  sequenceStateWalk,
} from "./state-machine-step.js";

// A tiny TCP-handshake-shaped machine used across the tests.
const T: SMTransition[] = [
  { from: "closed", to: "syn-sent", on: "SYN" }, // 0
  { from: "syn-sent", to: "established", on: "SYN-ACK" }, // 1
  { from: "established", to: "closed", on: "FIN" }, // 2
  { from: "closed", to: "listen", on: "passive-open" }, // 3
];

describe("initialStep", () => {
  test("token on start, nothing spent", () => {
    expect(initialStep("closed")).toEqual({ activeState: "closed", cursor: 0, spent: [] });
  });
});

describe("matchTransitionRef", () => {
  test("numeric string → index", () => {
    expect(matchTransitionRef(T, "1")).toBe(1);
    expect(matchTransitionRef(T, "0")).toBe(0);
  });
  test("out-of-range numeric → -1", () => {
    expect(matchTransitionRef(T, "9")).toBe(-1);
  });
  test("from>to matches first pair", () => {
    expect(matchTransitionRef(T, "closed>syn-sent")).toBe(0);
    expect(matchTransitionRef(T, "established>closed")).toBe(2);
  });
  test("from>to:on disambiguates by event", () => {
    expect(matchTransitionRef(T, "closed>listen:passive-open")).toBe(3);
  });
  test("unknown ref → -1", () => {
    expect(matchTransitionRef(T, "nope>nowhere")).toBe(-1);
    expect(matchTransitionRef(T, "garbage")).toBe(-1);
  });
});

describe("resolveSequence", () => {
  test("resolves mixed numeric + named refs, in order, dropping bad ones", () => {
    const seq = resolveSequence(T, ["0", "syn-sent>established", "bad>ref", "2"]);
    expect(seq.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(seq[0]!.on).toBe("SYN");
  });
  test("undefined / empty → []", () => {
    expect(resolveSequence(T, undefined)).toEqual([]);
    expect(resolveSequence(T, [])).toEqual([]);
  });
});

describe("outgoing", () => {
  test("returns only transitions leaving the given state", () => {
    const out = outgoing(T, "closed");
    expect(out.map((t) => t.index).sort()).toEqual([0, 3]);
  });
  test("no outgoing → empty", () => {
    expect(outgoing(T, "syn-sent").map((t) => t.index)).toEqual([1]);
    expect(outgoing(T, "listen")).toEqual([]);
  });
});

describe("stepSequence", () => {
  test("advances the token along the resolved walk", () => {
    const seq = resolveSequence(T, ["0", "1", "2"]);
    let s = initialStep("closed");
    s = stepSequence(s, seq);
    expect(s).toEqual({ activeState: "syn-sent", cursor: 1, spent: [0] });
    s = stepSequence(s, seq);
    expect(s).toEqual({ activeState: "established", cursor: 2, spent: [0, 1] });
    s = stepSequence(s, seq);
    expect(s).toEqual({ activeState: "closed", cursor: 3, spent: [0, 1, 2] });
  });
  test("stepping past the end is a no-op (idempotent)", () => {
    const seq = resolveSequence(T, ["0"]);
    let s = stepSequence(initialStep("closed"), seq);
    const done = stepSequence(s, seq);
    expect(done).toBe(s); // same reference → no-op
  });
});

describe("fireTransition", () => {
  test("fires a transition that leaves the active state", () => {
    const s = fireTransition(initialStep("closed"), T, 0);
    expect(s.activeState).toBe("syn-sent");
    expect(s.spent).toEqual([0]);
    expect(s.cursor).toBe(1);
  });
  test("no-op when the transition doesn't leave the active state", () => {
    const start = initialStep("closed");
    // transition 1 leaves syn-sent, not closed
    expect(fireTransition(start, T, 1)).toBe(start);
  });
  test("no-op for an out-of-range index", () => {
    const start = initialStep("closed");
    expect(fireTransition(start, T, 99)).toBe(start);
  });
});

describe("isComplete", () => {
  test("true only when cursor reaches the sequence length", () => {
    expect(isComplete({ activeState: "x", cursor: 3, spent: [] }, 3)).toBe(true);
    expect(isComplete({ activeState: "x", cursor: 2, spent: [] }, 3)).toBe(false);
  });
  test("false when there is no sequence", () => {
    expect(isComplete({ activeState: "x", cursor: 5, spent: [] }, 0)).toBe(false);
  });
});

describe("appendUnique", () => {
  test("appends new, ignores duplicate, keeps order", () => {
    expect(appendUnique([0, 1], 2)).toEqual([0, 1, 2]);
    expect(appendUnique([0, 1], 1)).toEqual([0, 1]);
  });
});

describe("sequenceStateWalk", () => {
  test("lists the ordered state ids from start through the walk", () => {
    const seq = resolveSequence(T, ["0", "1", "2"]);
    expect(sequenceStateWalk("closed", seq)).toEqual([
      "closed",
      "syn-sent",
      "established",
      "closed",
    ]);
  });
  test("start-only walk when sequence is empty", () => {
    expect(sequenceStateWalk("closed", [])).toEqual(["closed"]);
  });
});
