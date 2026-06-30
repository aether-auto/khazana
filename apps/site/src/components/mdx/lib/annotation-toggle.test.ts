// apps/site/src/components/mdx/lib/annotation-toggle.test.ts
import { expect, test } from "vitest";
import { toggleOpen, handleKeyDown, isOutsideClick } from "./annotation-toggle.js";

// ── toggleOpen ────────────────────────────────────────────────────────────────

test("toggleOpen: false → true (tap opens closed annotation)", () => {
  expect(toggleOpen(false)).toBe(true);
});

test("toggleOpen: true → false (tap closes open annotation)", () => {
  expect(toggleOpen(true)).toBe(false);
});

// ── handleKeyDown ─────────────────────────────────────────────────────────────

test("handleKeyDown: Escape closes an open annotation", () => {
  expect(handleKeyDown("Escape", true)).toBe(false);
});

test("handleKeyDown: Escape on already-closed annotation returns null (no-op)", () => {
  expect(handleKeyDown("Escape", false)).toBeNull();
});

test("handleKeyDown: other keys return null (unhandled)", () => {
  expect(handleKeyDown("Enter", true)).toBeNull();
  expect(handleKeyDown("Tab", false)).toBeNull();
  expect(handleKeyDown(" ", true)).toBeNull();
});

// ── isOutsideClick ────────────────────────────────────────────────────────────
// isOutsideClick wraps Element.contains(). We use lightweight mocks so the
// tests run in node environment without requiring jsdom.

function makeContainer(containsResult: boolean): Element {
  return { contains: () => containsResult } as unknown as Element;
}
const anyTarget = {} as EventTarget;

test("isOutsideClick: null target → false (guard, never close)", () => {
  expect(isOutsideClick(null, makeContainer(false))).toBe(false);
});

test("isOutsideClick: null container → false (guard, never close)", () => {
  expect(isOutsideClick(anyTarget, null)).toBe(false);
});

test("isOutsideClick: container.contains returns true → false (target is inside)", () => {
  expect(isOutsideClick(anyTarget, makeContainer(true))).toBe(false);
});

test("isOutsideClick: container.contains returns false → true (target is outside)", () => {
  expect(isOutsideClick(anyTarget, makeContainer(false))).toBe(true);
});
