// Pure command model + matcher for the ⌘K palette. No DOM, no network.
// Deterministic: stable definition order, stable tie-breaks.
// Import from the vocab sub-path to avoid pulling node:crypto (feed-item.ts) into
// the browser bundle via the @khazana/core barrel.
import { CHANNELS } from "@khazana/core/vocab";

export type CommandKind = "section" | "channel";

export interface Command {
  id: string;
  label: string;
  hint: string;
  href: string;
  kind: CommandKind;
}

const SECTIONS: { label: string; hint: string; path: string }[] = [
  { label: "feed", hint: "the signal, ranked", path: "/" },
  { label: "reads", hint: "long-form, in your voice", path: "/reads" },
  { label: "workshop", hint: "things to build", path: "/workshop" },
  { label: "graph", hint: "connections", path: "/graph" },
  { label: "sources", hint: "the intake manifold", path: "/sources" },
  { label: "taste", hint: "what khazana thinks you like", path: "/taste" },
];

/** Which of the two faces the palette is opening from. */
export type Face = "study" | "atlas";

/**
 * Build the static command list. `base` is the site base path (no trailing
 * slash needed). `face` selects the ONE first-class crossing command appended
 * to the section group: from the Study you get "Switch to Atlas" (→ /atlas);
 * from Atlas you get "Switch to the Study" (→ /). The crossing command is a
 * first-class palette entry so the face-switch is never a hunt-for-the-bezel
 * affordance (§5.1 of the Two-Faces design spec).
 */
export function buildCommands(base: string, face: Face = "study"): Command[] {
  const root = base.replace(/\/$/, "");
  const join = (p: string) => `${root}${p === "/" ? "/" : p}`;
  const sections: Command[] = SECTIONS.map((s) => ({
    id: `section:${s.label}`,
    label: s.label,
    hint: s.hint,
    href: join(s.path),
    kind: "section",
  }));
  const crossing: Command =
    face === "atlas"
      ? {
          id: "cross:study",
          label: "Switch to the Study",
          hint: "back to the reading room",
          href: join("/"),
          kind: "section",
        }
      : {
          id: "cross:atlas",
          label: "Switch to Atlas",
          hint: "the world, one instrument",
          href: join("/atlas"),
          kind: "section",
        };
  const channels: Command[] = CHANNELS.map((c) => ({
    id: `channel:${c}`,
    label: c,
    hint: "channel",
    href: `${root}/?channel=${c}`,
    kind: "channel",
  }));
  return [...sections, crossing, ...channels];
}

/** Match tier: lower is better. -1 = no match. */
function scoreLabel(label: string, q: string): number {
  if (q === "") return 0;
  const l = label.toLowerCase();
  const query = q.toLowerCase();
  const idx = l.indexOf(query);
  if (idx === 0) return 0; // prefix
  if (idx > 0) return 1 + idx / 100; // substring, earlier is better
  // subsequence: all query chars appear in order
  let qi = 0;
  for (let i = 0; i < l.length && qi < query.length; i++) {
    if (l[i] === query[qi]) qi++;
  }
  return qi === query.length ? 2 : -1;
}

/** Pure ranker. Empty query → all commands in definition order. No matches → []. */
export function rankCommands(commands: ReadonlyArray<Command>, query: string): Command[] {
  const q = query.trim();
  if (q === "") return [...commands];
  return commands
    .map((cmd, i) => ({ cmd, i, score: scoreLabel(cmd.label, q) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => (a.score !== b.score ? a.score - b.score : a.i - b.i)) // stable tie-break
    .map((x) => x.cmd);
}
