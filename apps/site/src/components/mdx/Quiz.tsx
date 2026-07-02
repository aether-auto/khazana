// apps/site/src/components/mdx/Quiz.tsx
//
// CheckYourUnderstanding — 1–N multiple-choice or numeric comprehension checks
// with per-question explanations. Select an answer → immediate correct /
// incorrect verdict + the `explain` teaching moment. Answers are EMBEDDED in the
// props (low-stakes, offline-fine) so grading is client-side and deterministic.
//
// ── Invariants ───────────────────────────────────────────────────────────────
//  • SSR / no-JS fallback that is NEVER blank: the questions (and their correct
//    answers + explanations) render inside a native <details> — visible and
//    usable with zero JavaScript. The interactive graded version replaces it
//    only after hydration.
//  • prefers-reduced-motion: no animation needed at all; the verdict is a static
//    color + glyph. Nothing to disable — trivially safe.
//  • Prose stays calm at 65ch. Correct = amber check (--accent); wrong = clay
//    (--editorial, the repo's clay token). No horizontal overflow at 360px.
//
// Data is a SERIALIZABLE `questions` prop (plain JSON) — no MDX children — so
// Astro hands it to the island intact (same rule as Scrolly/StatBand/Stepper).
import { useState } from "react";
import {
  questionKind,
  isMultipleChoiceCorrect,
  isNumericCorrect,
  parseNumericInput,
  correctAnswerText,
  type QuizQuestion,
} from "./lib/quiz-check.js";
import "./mdx.css";
import "./Quiz.css";

export interface QuizProps {
  /** The ordered questions; fully serializable (answers embedded). */
  questions: QuizQuestion[];
  caption?: string;
}

/** Per-question interaction state after the reader answers. */
type Verdict = { answered: false } | { answered: true; correct: boolean };

function QuizItem({ q, index }: { q: QuizQuestion; index: number }) {
  const kind = questionKind(q);
  const [verdict, setVerdict] = useState<Verdict>({ answered: false });
  const [picked, setPicked] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState(false);

  const choose = (choiceIndex: number) => {
    setPicked(choiceIndex);
    setVerdict({ answered: true, correct: isMultipleChoiceCorrect(q, choiceIndex) });
  };

  const submitNumeric = () => {
    const value = parseNumericInput(input);
    if (value === null) {
      setInputError(true);
      return;
    }
    setInputError(false);
    setVerdict({ answered: true, correct: isNumericCorrect(q, value) });
  };

  return (
    <li className="mdx-quiz__q">
      <p className="mdx-quiz__prompt">
        <span className="mdx-quiz__q-num" aria-hidden="true">
          Q{index + 1}
        </span>
        {q.prompt}
      </p>

      {kind === "mc" ? (
        <ul className="mdx-quiz__choices" role="group" aria-label={`Question ${index + 1} choices`}>
          {(q.choices ?? []).map((choice, ci) => {
            const isPicked = picked === ci;
            const isTheAnswer = verdict.answered && isMultipleChoiceCorrect(q, ci);
            const cls = ["mdx-quiz__choice"];
            if (verdict.answered) {
              if (isTheAnswer) cls.push("mdx-quiz__choice--correct");
              else if (isPicked) cls.push("mdx-quiz__choice--wrong");
            }
            return (
              <li key={ci}>
                <button
                  type="button"
                  className={cls.join(" ")}
                  aria-pressed={isPicked}
                  onClick={() => choose(ci)}
                >
                  <span className="mdx-quiz__choice-mark" aria-hidden="true" />
                  <span className="mdx-quiz__choice-text">{choice}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mdx-quiz__numeric">
          <input
            type="text"
            inputMode="decimal"
            className={inputError ? "mdx-quiz__input mdx-quiz__input--error" : "mdx-quiz__input"}
            value={input}
            aria-label={`Answer for question ${index + 1}`}
            placeholder="your answer"
            onChange={(e) => {
              setInput(e.target.value);
              setInputError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitNumeric();
            }}
          />
          <button type="button" className="mdx-quiz__submit" onClick={submitNumeric}>
            Check
          </button>
          {inputError ? <span className="mdx-quiz__hint">enter a number</span> : null}
        </div>
      )}

      {verdict.answered ? (
        <div
          className={
            verdict.correct
              ? "mdx-quiz__verdict mdx-quiz__verdict--correct"
              : "mdx-quiz__verdict mdx-quiz__verdict--wrong"
          }
          role="status"
        >
          <span className="mdx-quiz__verdict-label">
            {verdict.correct ? "✓ Correct" : "✗ Not quite"}
          </span>
          {!verdict.correct ? (
            <span className="mdx-quiz__answer">Answer: {correctAnswerText(q)}</span>
          ) : null}
          <span className="mdx-quiz__explain">{q.explain}</span>
        </div>
      ) : null}
    </li>
  );
}

export default function Quiz({ questions, caption }: QuizProps) {
  const safeQuestions = Array.isArray(questions) ? questions : [];

  // Empty guard: never blank, never throw.
  if (safeQuestions.length === 0) {
    return caption ? (
      <figure className="mdx-figure mdx-quiz">
        <figcaption className="mdx-caption">{caption}</figcaption>
      </figure>
    ) : null;
  }

  return (
    <figure className="mdx-figure mdx-quiz">
      {/* No-JS / SSR fallback: the questions + answers + explanations live in a
          native <details>, so the static HTML is never blank and every answer
          is reachable offline. This whole block is REPLACED by the interactive
          graded UI once the island hydrates — but until then (and forever with
          JS off) it is a complete, usable quiz. */}
      <noscript>
        <ol className="mdx-quiz__fallback-list">
          {safeQuestions.map((q, i) => (
            <li key={i} className="mdx-quiz__fallback-q">
              <p className="mdx-quiz__prompt">{q.prompt}</p>
              {questionKind(q) === "mc" && Array.isArray(q.choices) ? (
                <ul className="mdx-quiz__fallback-choices">
                  {q.choices.map((c, ci) => (
                    <li key={ci}>{c}</li>
                  ))}
                </ul>
              ) : null}
              <details className="mdx-quiz__fallback-answer">
                <summary>Show answer</summary>
                <p>
                  <strong>Answer:</strong> {correctAnswerText(q)}
                </p>
                <p>{q.explain}</p>
              </details>
            </li>
          ))}
        </ol>
      </noscript>

      {/* Interactive graded quiz. This is the real UI that hydrates. With JS OFF
          it still renders (SSR) as usable un-graded questions + choices, and the
          <noscript> above adds the correct answers + explanations in <details> —
          so the no-JS experience is complete and never blank (same pattern as
          RunnableCode's <noscript> supplement). With JS ON, selecting a choice
          grades immediately and reveals the explanation. */}
      <ol className="mdx-quiz__live">
        {safeQuestions.map((q, i) => (
          <QuizItem key={i} q={q} index={i} />
        ))}
      </ol>

      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
