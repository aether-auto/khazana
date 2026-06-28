import { describe, it, expect } from "vitest";
import {
  activeMarkIndex,
  activeParagraphIndex,
  sortMarks,
  formatClock,
  progressFraction,
  seekTimeFromFraction,
  coerceRate,
  coerceVolume,
  type ParagraphMark,
} from "./narration.js";

const marks: ParagraphMark[] = [
  { index: 0, startSec: 0 },
  { index: 1, startSec: 5 },
  { index: 2, startSec: 12.5 },
  { index: 3, startSec: 20 },
];

describe("activeMarkIndex", () => {
  it("returns -1 before the first mark", () => {
    expect(activeMarkIndex(marks, -1)).toBe(-1);
  });
  it("picks the last mark whose startSec is <= t", () => {
    expect(activeMarkIndex(marks, 0)).toBe(0);
    expect(activeMarkIndex(marks, 4.9)).toBe(0);
    expect(activeMarkIndex(marks, 5)).toBe(1);
    expect(activeMarkIndex(marks, 12.49)).toBe(1);
    expect(activeMarkIndex(marks, 12.5)).toBe(2);
    expect(activeMarkIndex(marks, 999)).toBe(3);
  });
  it("returns -1 for an empty marks array", () => {
    expect(activeMarkIndex([], 10)).toBe(-1);
  });
});

describe("activeParagraphIndex", () => {
  it("resolves to the paragraph index, not the array position", () => {
    const offset: ParagraphMark[] = [
      { index: 7, startSec: 0 },
      { index: 8, startSec: 10 },
    ];
    expect(activeParagraphIndex(offset, 0)).toBe(7);
    expect(activeParagraphIndex(offset, 10)).toBe(8);
  });
  it("is null before narration reaches the first paragraph", () => {
    expect(activeParagraphIndex(marks, -0.5)).toBeNull();
  });
});

describe("sortMarks", () => {
  it("sorts out-of-order marks by startSec", () => {
    const out = sortMarks([
      { index: 2, startSec: 12.5 },
      { index: 0, startSec: 0 },
      { index: 1, startSec: 5 },
    ]);
    expect(out.map((m) => m.index)).toEqual([0, 1, 2]);
  });
  it("drops duplicate paragraph indices, keeping the earliest", () => {
    const out = sortMarks([
      { index: 0, startSec: 0 },
      { index: 0, startSec: 9 },
      { index: 1, startSec: 5 },
    ]);
    expect(out.map((m) => m.index)).toEqual([0, 1]);
  });
  it("filters non-finite entries", () => {
    const out = sortMarks([
      { index: 0, startSec: 0 },
      { index: 1, startSec: Number.NaN },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe("formatClock", () => {
  it("formats m:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(7)).toBe("0:07");
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(249)).toBe("4:09");
  });
  it("formats h:mm:ss past an hour", () => {
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3849)).toBe("1:04:09");
  });
  it("clamps NaN / negative to 0:00 (still-loading audio)", () => {
    expect(formatClock(Number.NaN)).toBe("0:00");
    expect(formatClock(-5)).toBe("0:00");
    expect(formatClock(Infinity)).toBe("0:00");
  });
});

describe("progressFraction", () => {
  it("is the clamped position/duration ratio", () => {
    expect(progressFraction(0, 100)).toBe(0);
    expect(progressFraction(50, 100)).toBe(0.5);
    expect(progressFraction(200, 100)).toBe(1);
  });
  it("is 0 for a zero / NaN duration (pre-metadata)", () => {
    expect(progressFraction(10, 0)).toBe(0);
    expect(progressFraction(10, Number.NaN)).toBe(0);
  });
});

describe("seekTimeFromFraction", () => {
  it("maps a bar fraction to a seek time", () => {
    expect(seekTimeFromFraction(0, 100)).toBe(0);
    expect(seekTimeFromFraction(0.25, 100)).toBe(25);
    expect(seekTimeFromFraction(1, 100)).toBe(100);
  });
  it("clamps an over/under drag", () => {
    expect(seekTimeFromFraction(1.5, 100)).toBe(100);
    expect(seekTimeFromFraction(-1, 100)).toBe(0);
  });
});

describe("coerceRate", () => {
  it("returns an exact rate unchanged", () => {
    expect(coerceRate(1.25)).toBe(1.25);
  });
  it("snaps to the nearest offered rate", () => {
    expect(coerceRate(1.1)).toBe(1);
    expect(coerceRate(1.4)).toBe(1.5);
    expect(coerceRate(3)).toBe(2);
  });
  it("defaults to 1 for garbage", () => {
    expect(coerceRate("nope")).toBe(1);
    expect(coerceRate(null)).toBe(1);
  });
});

describe("coerceVolume", () => {
  it("clamps to [0,1]", () => {
    expect(coerceVolume(0.5)).toBe(0.5);
    expect(coerceVolume(2)).toBe(1);
    expect(coerceVolume(-1)).toBe(0);
  });
  it("defaults to 1 for non-finite", () => {
    expect(coerceVolume("x")).toBe(1);
    expect(coerceVolume(undefined)).toBe(1);
  });
});
