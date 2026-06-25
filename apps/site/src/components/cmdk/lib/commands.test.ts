import { expect, test } from "vitest";
import { buildCommands, rankCommands } from "./commands.js";

const cmds = buildCommands("/khazana");

test("buildCommands includes the section nav and every channel", () => {
  const labels = cmds.map((c) => c.label);
  for (const section of ["feed", "reads", "workshop", "graph", "sources", "taste"]) {
    expect(labels).toContain(section);
  }
  // 6 sections + 18 channels
  expect(cmds).toHaveLength(6 + 18);
});

test("section hrefs respect the base path", () => {
  const graph = cmds.find((c) => c.label === "graph");
  expect(graph?.href).toBe("/khazana/graph");
  const ai = cmds.find((c) => c.label === "ai" && c.kind === "channel");
  expect(ai?.href).toBe("/khazana/?channel=ai");
});

test("empty query returns all commands in stable definition order", () => {
  const ranked = rankCommands(cmds, "");
  expect(ranked).toEqual(cmds);
});

test("substring match ranks a prefix above a mid-string hit", () => {
  // 'science' is a prefix match for "sc"; 'data-science' is a substring match.
  // prefix (score 0) must rank before substring (score > 0).
  const ranked = rankCommands(cmds, "sc");
  const labels = ranked.map((c) => c.label);
  expect(labels).toContain("science");
  expect(labels).toContain("data-science");
  expect(labels.indexOf("science")).toBeLessThan(labels.indexOf("data-science"));
});

test("fuzzy subsequence matches across gaps (e.g. 'dst' -> data-strategy)", () => {
  const labels = rankCommands(cmds, "dst").map((c) => c.label);
  expect(labels).toContain("data-strategy");
  // data-science: d,a,t,a,-,s,c -> d..s but no 't' after 's' -> NOT a subsequence of 'dst'
});

test("no-match query returns empty", () => {
  expect(rankCommands(cmds, "zzzqqq")).toHaveLength(0);
});

test("ranking is deterministic and stable on ties", () => {
  const a = rankCommands(cmds, "data").map((c) => c.label);
  const b = rankCommands(cmds, "data").map((c) => c.label);
  expect(a).toEqual(b);
});
