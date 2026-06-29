// apps/site/src/components/mdx/DataTable.tsx
import { useMemo, useState } from "react";
import { sortRows, filterRows, type Column, type Row, type SortDir } from "./lib/table-sort.js";
import "./mdx.css";
import "./DataTable.css";

export interface DataTableProps {
  columns: Column[];
  rows: Row[];
  caption?: string;
  /** Show the filter input (default true). */
  filterable?: boolean;
}

/**
 * Sortable/filterable table. Pure helpers do the work; headers are real
 * <button>s inside <th> with aria-sort. SSR renders the full table unsorted,
 * so no-JS readers get every row.
 */
export default function DataTable({ columns, rows, caption, filterable = true }: DataTableProps) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const [query, setQuery] = useState("");

  const view = useMemo(() => {
    const filtered = filterRows(rows, columns, query);
    return sort ? sortRows(filtered, sort.key, sort.dir) : filtered;
  }, [rows, columns, query, sort]);

  const toggleSort = (key: string) =>
    setSort((s) =>
      s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  const ariaSort = (key: string): "ascending" | "descending" | "none" =>
    sort?.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none";

  return (
    <figure className="mdx-figure dt">
      {filterable ? (
        <div className="dt-toolbar">
          <label className="mdx-label" htmlFor="dt-filter">filter</label>
          <input
            id="dt-filter"
            className="dt-input"
            type="text"
            value={query}
            placeholder="Filter rows…"
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="dt-count">
            {view.length === rows.length ? `${rows.length} rows` : `${view.length} of ${rows.length} rows`}
          </span>
        </div>
      ) : null}
      <div className="mdx-panel dt-scroll">
        <table className="dt-table">
          {caption ? <caption className="dt-caption mdx-label">{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  aria-sort={ariaSort(c.key)}
                  className={c.align === "right" ? "dt-th dt-th--right" : "dt-th"}
                >
                  <button type="button" className="dt-sortbtn" onClick={() => toggleSort(c.key)}>
                    {c.label}
                    <span className="dt-arrow" aria-hidden="true">
                      {sort?.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key} className={c.align === "right" ? "dt-td dt-td--right" : "dt-td"}>
                    {String(row[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
