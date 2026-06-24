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
