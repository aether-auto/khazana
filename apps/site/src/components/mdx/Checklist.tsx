// apps/site/src/components/mdx/Checklist.tsx
//
// An interactive "reproduce-this" checklist. React island (client:visible) —
// interaction + persistence require JS, so this is an island (not an Astro
// static component). The reader ticks items; progress is saved to localStorage
// under a STABLE key derived from the title + item labels (see lib/checklist-store),
// so it survives reloads and is scoped per-checklist.
//
// Fallbacks (never blank):
//   • SSR / no-JS → a static, semantic <ul> of every item (label + note + link),
//     fully readable without any script. Hydration swaps in the interactive
//     checkboxes; the class flips to `.ckl--hydrated`.
//   • prefers-reduced-motion → no animation anywhere (the checkmark is an
//     instant end-state; strikethrough is static). Handled purely in CSS.
//
// localStorage is GUARDED for SSR + private-mode safety: every access is wrapped
// in try/catch and gated on `typeof window`, so a disabled/quota-exceeded store
// degrades to an in-memory (non-persisted) checklist instead of throwing.
import { useEffect, useId, useState } from "react";
import {
  storageKey,
  parseState,
  serializeState,
  completedCount,
  type ChecklistItem,
} from "./lib/checklist-store.js";
import "./mdx.css";
import "./Checklist.css";

export interface ChecklistProps {
  /** The steps to reproduce — each ticks independently. */
  items: ChecklistItem[];
  /** Optional heading (also part of the storage-key identity). */
  title?: string;
  /** Editorial caption (Fraunces, shared .mdx-caption). */
  caption?: string;
}

/** SSR-safe, private-mode-safe read. Returns null on any failure. */
function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** SSR-safe, private-mode-safe write. Silently no-ops on any failure. */
function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / quota exceeded → degrade to in-memory only */
  }
}

export default function Checklist({ items, title, caption }: ChecklistProps) {
  const baseId = useId();
  const key = storageKey(items, title);

  // Start all-false so SSR markup and first client render match (no hydration
  // mismatch). The saved state is loaded in an effect AFTER mount.
  const [state, setState] = useState<boolean[]>(() =>
    new Array<boolean>(items.length).fill(false),
  );
  // Flipped true after mount: proves JS runs, so we show the interactive list.
  // Under no-JS this stays false → the static <ul> fallback shows.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(parseState(safeGet(key), items.length));
    setHydrated(true);
    // key changes only if the checklist identity changes (title/labels).
  }, [key, items.length]);

  function toggle(i: number) {
    setState((prev) => {
      const next = prev.slice();
      next[i] = !next[i];
      safeSet(key, serializeState(next));
      return next;
    });
  }

  const done = completedCount(state);
  const total = items.length;

  return (
    <figure className={hydrated ? "mdx-figure ckl ckl--hydrated" : "mdx-figure ckl"}>
      <div className="mdx-panel ckl-panel">
        <div className="ckl-head">
          {title ? <span className="ckl-title">{title}</span> : <span className="ckl-title ckl-title--default">Reproduce this</span>}
          {/* progress readout — only meaningful once interactive */}
          <span className="ckl-progress mdx-label" aria-live="polite">
            {done} / {total} done
          </span>
        </div>

        {/* Interactive list (shown when hydrated) */}
        <ul className="ckl-list" role="list">
          {items.map((it, i) => {
            const checked = state[i] === true;
            const cbId = `${baseId}-${i}`;
            return (
              <li
                key={`${it.label}-${i}`}
                className={checked ? "ckl-item ckl-item--done" : "ckl-item"}
              >
                <input
                  type="checkbox"
                  id={cbId}
                  className="ckl-check"
                  checked={checked}
                  onChange={() => toggle(i)}
                />
                <label className="ckl-body" htmlFor={cbId}>
                  <span className="ckl-label">{it.label}</span>
                  {it.note ? <span className="ckl-note">{it.note}</span> : null}
                  {it.href ? (
                    <a
                      className="ckl-link"
                      href={it.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      // keep clicking the link from toggling the box
                      onClick={(e) => e.stopPropagation()}
                    >
                      reference ↗
                    </a>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>

        {/* SSR / no-JS fallback: a static, fully-readable list. Hidden once
            hydrated (the interactive list above takes over). */}
        <ul className="ckl-fallback" role="list">
          {items.map((it, i) => (
            <li key={`f-${i}`} className="ckl-fallback-item">
              <span className="ckl-fallback-box" aria-hidden="true">☐</span>
              <span className="ckl-fallback-body">
                <span className="ckl-label">{it.label}</span>
                {it.note ? <span className="ckl-note">{it.note}</span> : null}
                {it.href ? (
                  <a className="ckl-link" href={it.href} target="_blank" rel="noopener noreferrer">
                    reference ↗
                  </a>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}

export type { ChecklistItem };
