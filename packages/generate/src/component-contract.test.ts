import { expect, test } from "vitest";
import { CONTRACT_COMPONENTS, COMPONENT_METADATA } from "./component-contract.js";

test("COMPONENT_METADATA has exactly one entry per CONTRACT_COMPONENTS name (no drift)", () => {
  expect(Object.keys(COMPONENT_METADATA).sort()).toEqual([...CONTRACT_COMPONENTS].sort());
});

test("every metadata entry carries a non-empty blurb, props summary, and at least one kit", () => {
  for (const name of CONTRACT_COMPONENTS) {
    const meta = COMPONENT_METADATA[name]!;
    expect(meta.blurb.length, `${name} blurb`).toBeGreaterThan(0);
    expect(meta.props.length, `${name} props`).toBeGreaterThan(0);
    expect(meta.kits.length, `${name} kits`).toBeGreaterThan(0);
  }
});

test("field-notes' kit is the deliberately tiny documented subset (Annotation/DataTable primary, StatBand/Pullquote/Callout sparingly)", () => {
  const fieldNotesComponents = CONTRACT_COMPONENTS.filter((c) => COMPONENT_METADATA[c]!.kits.includes("field-notes"));
  expect(fieldNotesComponents.sort()).toEqual(["Annotation", "Callout", "DataTable", "Pullquote", "StatBand"]);
});

test("a signature teardown component (StateMachine) lists teardown in its kits", () => {
  expect(COMPONENT_METADATA.StateMachine!.kits).toContain("teardown");
});
