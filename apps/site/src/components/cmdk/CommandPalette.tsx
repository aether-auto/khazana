import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { buildCommands, rankCommands, type Command, type Face } from "./lib/commands.js";
import { loadPagefind, search, type PagefindApi, type SearchResult } from "../../lib/search.js";
import "./CommandPalette.css";

interface Props {
  /** Site base path (import.meta.env.BASE_URL from the Shell). */
  base: string;
  /** Which face the palette is opening from — selects the crossing command. */
  face?: Face;
}

type Row =
  | { type: "command"; cmd: Command }
  | { type: "result"; result: SearchResult };

const FOCUSABLE = 'a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])';

export default function CommandPalette({ base, face = "study" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "ok" | "unbuilt">("idle");

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const apiRef = useRef<PagefindApi | null>(null);
  const listId = useId();

  const commands = useMemo(() => buildCommands(base, face), [base, face]);
  const ranked = useMemo(() => rankCommands(commands, query), [commands, query]);

  const rows: Row[] = useMemo(
    () => [
      ...ranked.map((cmd): Row => ({ type: "command", cmd })),
      ...results.map((result): Row => ({ type: "result", result })),
    ],
    [ranked, results],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActive(0);
    restoreRef.current?.focus();
  }, []);

  const openPalette = useCallback(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);

  // Global ⌘K / Ctrl+K toggle + wire the existing Shell .cmdk hint button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open ? close() : openPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    const trigger = document.querySelector<HTMLButtonElement>(".cmdk");
    const onClick = () => openPalette();
    trigger?.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      trigger?.removeEventListener("click", onClick);
    };
  }, [open, close, openPalette]);

  // Lazy-load Pagefind once, the first time the palette opens.
  useEffect(() => {
    if (!open || apiRef.current || searchState !== "idle") return;
    let cancelled = false;
    void loadPagefind({ base }).then((api) => {
      if (cancelled) return;
      apiRef.current = api;
      setSearchState(api ? "ok" : "unbuilt");
    });
    return () => {
      cancelled = true;
    };
  }, [open, base, searchState]);

  // Debounced content search as the user types.
  useEffect(() => {
    if (!open || !apiRef.current) return;
    const handle = window.setTimeout(() => {
      void search(apiRef.current as PagefindApi, query).then((r) => setResults(r));
    }, 120);
    return () => window.clearTimeout(handle);
  }, [open, query]);

  // Focus the input on open; restore body scroll lock.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Keep the active row in range.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  const go = useCallback(
    (row: Row) => {
      const href = row.type === "command" ? row.cmd.href : row.result.url;
      window.location.href = href;
    },
    [],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (rows.length ? (a + 1) % rows.length : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (rows.length ? (a - 1 + rows.length) % rows.length : 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[active];
      if (row) go(row);
      return;
    }
    if (e.key === "Tab") {
      // Focus trap: keep focus inside the dialog.
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (!open) return null;

  return (
    <div className="cmdk-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={dialogRef}
        className="cmdk-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
      >
        <div className="cmdk-input-row">
          <span className="cmdk-prompt" aria-hidden="true">›</span>
          <input
            ref={inputRef}
            className="cmdk-input"
            type="text"
            placeholder="jump to a surface, channel, or search reads…"
            value={query}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          <kbd className="cmdk-esc">esc</kbd>
        </div>

        <ul className="cmdk-list" id={listId} role="listbox" aria-label="Results">
          {rows.length === 0 && <li className="cmdk-empty">no matches</li>}
          {rows.map((row, i) => {
            const isActive = i === active;
            const key = row.type === "command" ? row.cmd.id : `r:${row.result.url}`;
            return (
              <li
                key={key}
                role="option"
                aria-selected={isActive}
                className={isActive ? "cmdk-row cmdk-row--active" : "cmdk-row"}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(row);
                }}
              >
                {row.type === "command" ? (
                  <>
                    <span className={`cmdk-tag cmdk-tag--${row.cmd.kind}`}>{row.cmd.kind}</span>
                    <span className="cmdk-label">{row.cmd.label}</span>
                    <span className="cmdk-hint">{row.cmd.hint}</span>
                  </>
                ) : (
                  <>
                    <span className="cmdk-tag cmdk-tag--read">read</span>
                    <span className="cmdk-label">{row.result.title}</span>
                    <span
                      className="cmdk-excerpt"
                      dangerouslySetInnerHTML={{ __html: row.result.excerpt }}
                    />
                  </>
                )}
              </li>
            );
          })}
        </ul>

        {searchState === "unbuilt" && (
          <p className="cmdk-note">
            content search index not built yet — run a full <code>build</code>. nav still works.
          </p>
        )}
      </div>
    </div>
  );
}
