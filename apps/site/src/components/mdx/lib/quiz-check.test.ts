// apps/site/src/components/mdx/lib/quiz-check.test.ts
import { describe, expect, test } from "vitest";
import {
  questionKind,
  isMultipleChoiceCorrect,
  isNumericCorrect,
  parseNumericInput,
  correctAnswerText,
  type QuizQuestion,
} from "./quiz-check.js";

const mc: QuizQuestion = {
  prompt: "2 + 2 = ?",
  choices: ["3", "4", "5"],
  answer: 1,
  explain: "Two plus two is four.",
};
const numeric: QuizQuestion = {
  prompt: "Half of 10?",
  answer: 5,
  explain: "10 / 2 = 5.",
};

describe("questionKind", () => {
  test("explicit kind wins", () => {
    expect(questionKind({ ...numeric, kind: "mc", choices: ["a"] })).toBe("mc");
  });
  test("inferred from choices", () => {
    expect(questionKind(mc)).toBe("mc");
    expect(questionKind(numeric)).toBe("numeric");
    expect(questionKind({ ...numeric, choices: [] })).toBe("numeric");
  });
});

describe("isMultipleChoiceCorrect", () => {
  test("matches the answer index", () => {
    expect(isMultipleChoiceCorrect(mc, 1)).toBe(true);
    expect(isMultipleChoiceCorrect(mc, 0)).toBe(false);
  });
  test("string answer coerced; junk fails closed", () => {
    expect(isMultipleChoiceCorrect({ ...mc, answer: "1" }, 1)).toBe(true);
    expect(isMultipleChoiceCorrect({ ...mc, answer: "x" }, 1)).toBe(false);
  });
});

describe("parseNumericInput", () => {
  test("parses ints, decimals, signs, commas, whitespace", () => {
    expect(parseNumericInput("  5 ")).toBe(5);
    expect(parseNumericInput("-3.5")).toBe(-3.5);
    expect(parseNumericInput("+2")).toBe(2);
    expect(parseNumericInput("1,000")).toBe(1000);
    expect(parseNumericInput(".5")).toBe(0.5);
  });
  test("rejects non-numbers → null", () => {
    expect(parseNumericInput("")).toBeNull();
    expect(parseNumericInput("abc")).toBeNull();
    expect(parseNumericInput("-")).toBeNull();
    expect(parseNumericInput(".")).toBeNull();
  });
});

describe("isNumericCorrect", () => {
  test("exact + tolerant of float drift", () => {
    expect(isNumericCorrect(numeric, 5)).toBe(true);
    expect(isNumericCorrect(numeric, 5.0000000001)).toBe(true);
    expect(isNumericCorrect(numeric, 6)).toBe(false);
  });
  test("string answer coerced; NaN fails closed", () => {
    expect(isNumericCorrect({ ...numeric, answer: "5" }, 5)).toBe(true);
    expect(isNumericCorrect({ ...numeric, answer: "nope" }, 5)).toBe(false);
  });
});

describe("correctAnswerText", () => {
  test("mc → the choice text", () => {
    expect(correctAnswerText(mc)).toBe("4");
  });
  test("mc with missing choice → the raw answer", () => {
    expect(correctAnswerText({ ...mc, choices: undefined })).toBe("1");
  });
  test("numeric → the number as text", () => {
    expect(correctAnswerText(numeric)).toBe("5");
  });
});
