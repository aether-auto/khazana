// apps/site/src/components/mdx/p1-stepper-quiz-ssr.test.ts
//
// SSR / no-JS fallback tests for the P1 React islands Stepper and Quiz. Rendered
// with react-dom/server's renderToStaticMarkup (Node env, no jsdom) — asserting
// the static HTML is meaningful and non-blank (the "never blank" invariant) and
// that the reduced-motion / no-JS fallbacks carry every step / every answer.
//
// NOTE: Stepper's SSR-safe default is `reduced = true`, so the static render is
// always the ALL-steps <ol> fallback regardless of `mode` — exactly the no-JS
// behavior. Quiz's static render carries the live questions PLUS a <noscript>
// <details> that holds every correct answer + explanation.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import Stepper from "./Stepper.js";
import Quiz from "./Quiz.js";

test("Stepper SSR renders ALL steps as an <ol>, never blank (no-JS fallback)", () => {
  const html = renderToStaticMarkup(
    createElement(Stepper, {
      mode: "reveal", // even in reveal mode, SSR shows all (reduced default)
      steps: [
        { title: "Melt the tin", body: "<p>Heat the crucible to 232 C.</p>" },
        { title: "Pour the mold", body: "<p>Fill slowly to avoid voids.</p>" },
      ],
      caption: "the casting sequence",
    }),
  );
  expect(html.length).toBeGreaterThan(0);
  expect(html).toContain("<ol");
  expect(html).toContain("mdx-stepper--all");
  // every step's title + body present in static markup
  expect(html).toContain("Melt the tin");
  expect(html).toContain("Heat the crucible");
  expect(html).toContain("Pour the mold");
  expect(html).toContain("avoid voids");
  // amber number rail: zero-padded step numbers
  expect(html).toContain("01");
  expect(html).toContain("02");
  // caption wrapped in .mdx-caption inside .mdx-figure
  expect(html).toContain("mdx-figure");
  expect(html).toContain("the casting sequence");
});

test("Stepper SSR renders optional figure HTML above the body", () => {
  const html = renderToStaticMarkup(
    createElement(Stepper, {
      steps: [{ title: "Wire it", body: "<p>Connect D2 to the relay.</p>", figure: "<svg data-x='pin'></svg>" }],
    }),
  );
  expect(html).toContain("mdx-stepper__figure");
  expect(html).toContain("Connect D2");
});

test("Stepper empty steps → non-throwing (caption-only figure or null)", () => {
  const html = renderToStaticMarkup(createElement(Stepper, { steps: [], caption: "empty" }));
  expect(html).toContain("empty"); // caption still renders; no crash
});

test("Quiz SSR renders questions + answers + explanations in <noscript><details>, never blank", () => {
  const html = renderToStaticMarkup(
    createElement(Quiz, {
      questions: [
        {
          prompt: "Which sort is O(n log n) worst-case?",
          choices: ["quicksort", "mergesort", "bubble sort"],
          answer: 1,
          explain: "Mergesort's worst case is n log n; quicksort degrades to n^2.",
        },
        {
          prompt: "How many bits in a byte?",
          answer: 8,
          explain: "A byte is 8 bits.",
          kind: "numeric",
        },
      ],
      caption: "check your understanding",
    }),
  );
  expect(html.length).toBeGreaterThan(0);
  // the no-JS guaranteed fallback: a <noscript> with a <details> answer block
  expect(html).toContain("<noscript>");
  expect(html).toContain("<details");
  expect(html).toContain("Show answer");
  // prompts present
  expect(html).toContain("Which sort is O(n log n)");
  expect(html).toContain("How many bits in a byte");
  // the CORRECT answers surfaced in the fallback (mc → choice text, numeric → number)
  expect(html).toContain("mergesort");
  expect(html).toContain("A byte is 8 bits");
  // explanations present
  expect(html).toContain("degrades to n^2");
  // caption + figure frame
  expect(html).toContain("mdx-figure");
  expect(html).toContain("check your understanding");
});

test("Quiz empty questions → non-throwing", () => {
  const html = renderToStaticMarkup(createElement(Quiz, { questions: [], caption: "none" }));
  expect(html).toContain("none");
});
