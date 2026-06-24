import { expect, test } from "vitest";
import { timeAgo, formatBuildTime } from "./format.js";

const now = new Date("2026-06-23T12:00:00.000Z");

test("timeAgo renders compact relative spans", () => {
  expect(timeAgo("2026-06-23T11:59:40.000Z", now)).toBe("now");
  expect(timeAgo("2026-06-23T11:30:00.000Z", now)).toBe("30m");
  expect(timeAgo("2026-06-23T09:00:00.000Z", now)).toBe("3h");
  expect(timeAgo("2026-06-21T12:00:00.000Z", now)).toBe("2d");
  expect(timeAgo("2026-05-24T12:00:00.000Z", now)).toBe("30d");
  expect(timeAgo("2025-06-23T12:00:00.000Z", now)).toBe("1y");
});

test("timeAgo clamps future timestamps to now", () => {
  expect(timeAgo("2026-06-23T12:05:00.000Z", now)).toBe("now");
});

test("formatBuildTime renders YYYY-MM-DD HH:mm UTC", () => {
  expect(formatBuildTime("2026-06-23T12:34:56.000Z")).toBe("2026-06-23 12:34");
});
