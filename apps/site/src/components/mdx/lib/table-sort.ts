// apps/site/src/components/mdx/lib/table-sort.ts
/** Pure sort/filter helpers for <DataTable>. No DOM. Non-mutating. */

export type CellValue = string | number | boolean | null;
export type Row = Record<string, CellValue>;
export type SortDir = "asc" | "desc";

export interface Column {
  key: string;
  label: string;
  type?: "string" | "number";
  /** Right-align numeric columns, etc. */
  align?: "left" | "right";
}

/** Stable sort by `key`. Numbers numerically, everything else by locale string. */
export function sortRows(rows: ReadonlyArray<Row>, key: string, dir: SortDir): Row[] {
  const factor = dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const va = a.row[key];
      const vb = b.row[key];
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") {
        cmp = va - vb;
      } else {
        cmp = String(va ?? "").localeCompare(String(vb ?? ""), undefined, {
          sensitivity: "base",
          numeric: true,
        });
      }
      return cmp !== 0 ? cmp * factor : a.i - b.i; // stable tiebreak
    })
    .map((x) => x.row);
}

/**
 * Sum the numeric cells of one column, for a summable footer (bills-of-materials).
 * `number` cells are added directly; string cells are coerced when they parse as a
 * finite number (so `"80"` counts); everything else (null, booleans, non-numeric
 * strings) is skipped. Always returns a finite number (empty → 0).
 */
export function sumColumn(rows: ReadonlyArray<Row>, key: string): number {
  let total = 0;
  for (const row of rows) {
    const v = row[key];
    if (typeof v === "number") {
      if (Number.isFinite(v)) total += v;
    } else if (typeof v === "string") {
      const n = Number(v.trim());
      if (v.trim() !== "" && Number.isFinite(n)) total += n;
    }
  }
  return total;
}

/** Case-insensitive substring match across all column cells. */
export function filterRows(
  rows: ReadonlyArray<Row>,
  columns: ReadonlyArray<Column>,
  query: string,
): Row[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...rows];
  return rows.filter((row) =>
    columns.some((c) => String(row[c.key] ?? "").toLowerCase().includes(q)),
  );
}
