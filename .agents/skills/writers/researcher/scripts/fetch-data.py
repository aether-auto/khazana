#!/usr/bin/env python3
"""fetch-data.py — pull REAL series from free public data sources into <Chart> JSON.

khazana posts are data-grounded: a Dispatch or Teardown chart shows real numbers
from a citeable source, never invented values. This script fetches a time series
(or cross-section) from a free, no-API-key source and prints rows shaped for the
site's <Chart> component:

    [{ "x": "2022-01", "y": 7.5 }, ...]            # single series
    [{ "x": "2022", "y": 3.1, "series": "USA" }]   # multi-series (with --label)

Pipe the output straight into a Chart's `data={...}` prop, or save it:

    python3 fetch-data.py fred CPIAUCSL --since 2020-01-01 > cpi.json

DEPENDENCIES: Python 3 standard library only (urllib, json). No API keys, no
paid services, no pip installs. ($0 constraint.)

SOURCES (all free, no key):
  fred   <SERIES_ID>     Federal Reserve (FRED) via the public CSV download
                         endpoint (fredgraph.csv) — no key needed for CSV.
                         e.g. CPIAUCSL (CPI), UNRATE (unemployment), DGS10 (10y).
  wb     <INDICATOR> <ISO3>   World Bank Open Data JSON API.
                         e.g. wb NY.GDP.MKTP.KD.ZG USA  (GDP growth %)
  owid   <CSV_URL> <ENTITY> <COLUMN>   Our World in Data CSV (grapher export).
                         Pass a full ourworldindata.org grapher .csv URL.
  csv    <URL> <X_COL> <Y_COL> [SERIES_COL]   Generic public CSV puller.

ALWAYS cite the source. Print the citation line the chart's caption / sources[]
should reference — this script emits it to stderr so it never pollutes the JSON:

    SOURCE: FRED series CPIAUCSL — https://fred.stlouisfed.org/series/CPIAUCSL

GRACEFUL DEGRADATION: if a fetch fails (offline CI, source down), the script
exits non-zero with a clear message. The writer's instruction in that case is to
fall back to a <DataTable> of numbers cited DIRECTLY from the brief's source
items — never to fabricate chart data.
"""

from __future__ import annotations

import argparse
import csv as csvmod
import io
import json
import sys
import urllib.error
import urllib.request

TIMEOUT_S = 25
HEADERS = {"User-Agent": "Mozilla/5.0 (khazana-fetch-data/1.0)"}


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        return resp.read()


def _cite(line: str) -> None:
    print(f"SOURCE: {line}", file=sys.stderr)


def fetch_fred(series_id: str, since: str | None) -> list[dict]:
    """FRED public CSV endpoint — no API key. Returns [{x: date, y: value}]."""
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
    if since:
        url += f"&cosd={since}"
    raw = _get(url).decode("utf-8")
    rows: list[dict] = []
    reader = csvmod.reader(io.StringIO(raw))
    header = next(reader, None)  # DATE,<SERIES_ID>
    for rec in reader:
        if len(rec) < 2 or rec[1] in (".", ""):
            continue  # FRED uses '.' for missing
        try:
            rows.append({"x": rec[0], "y": float(rec[1])})
        except ValueError:
            continue
    _cite(f"FRED series {series_id} — https://fred.stlouisfed.org/series/{series_id}")
    return rows


def fetch_wb(indicator: str, country: str) -> list[dict]:
    """World Bank Open Data JSON. Returns [{x: year, y: value}] oldest->newest."""
    url = (
        f"https://api.worldbank.org/v2/country/{country}/indicator/{indicator}"
        f"?format=json&per_page=20000"
    )
    payload = json.loads(_get(url).decode("utf-8"))
    if not isinstance(payload, list) or len(payload) < 2 or payload[1] is None:
        raise RuntimeError(f"World Bank returned no data for {indicator}/{country}")
    rows: list[dict] = []
    for rec in payload[1]:
        if rec.get("value") is None:
            continue
        rows.append({"x": rec["date"], "y": float(rec["value"])})
    rows.sort(key=lambda r: r["x"])  # API returns newest-first
    _cite(
        f"World Bank indicator {indicator} ({country}) — "
        f"https://data.worldbank.org/indicator/{indicator}"
    )
    return rows


def fetch_owid(csv_url: str, entity: str, column: str) -> list[dict]:
    """Our World in Data grapher CSV export. Filter to one entity, one column."""
    raw = _get(csv_url).decode("utf-8")
    reader = csvmod.DictReader(io.StringIO(raw))
    rows: list[dict] = []
    for rec in reader:
        if rec.get("Entity") != entity:
            continue
        val = rec.get(column, "")
        if val in ("", None):
            continue
        try:
            rows.append({"x": rec.get("Year", ""), "y": float(val)})
        except ValueError:
            continue
    if not rows:
        raise RuntimeError(f"OWID: no rows for entity={entity!r} column={column!r}")
    _cite(f"Our World in Data — {csv_url}")
    return rows


def fetch_csv(url: str, x_col: str, y_col: str, series_col: str | None) -> list[dict]:
    """Generic public CSV. Map columns to {x, y[, series]}."""
    raw = _get(url).decode("utf-8")
    reader = csvmod.DictReader(io.StringIO(raw))
    rows: list[dict] = []
    for rec in reader:
        if y_col not in rec or rec[y_col] in ("", None):
            continue
        try:
            row: dict = {"x": rec.get(x_col, ""), "y": float(rec[y_col])}
        except ValueError:
            continue
        if series_col:
            row["series"] = rec.get(series_col, "")
        rows.append(row)
    if not rows:
        raise RuntimeError(f"CSV: no usable rows from {url}")
    _cite(url)
    return rows


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(
        description="Fetch REAL chart data from free public sources (no API key).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "examples:\n"
            "  fetch-data.py fred UNRATE --since 2015-01-01\n"
            "  fetch-data.py wb NY.GDP.MKTP.KD.ZG USA\n"
            "  fetch-data.py owid <grapher.csv URL> 'United States' 'column'\n"
            "  fetch-data.py csv <URL> year value country\n\n"
            "On failure, fall back to a <DataTable> citing numbers from the brief — "
            "never fabricate chart data."
        ),
    )
    sub = p.add_subparsers(dest="source", required=True)

    pf = sub.add_parser("fred", help="FRED series (public CSV, no key)")
    pf.add_argument("series_id")
    pf.add_argument("--since", default=None, help="start date YYYY-MM-DD")

    pw = sub.add_parser("wb", help="World Bank indicator")
    pw.add_argument("indicator")
    pw.add_argument("country", help="ISO3 code, e.g. USA")
    pw.add_argument("--label", default=None, help="tag rows with this series label")

    po = sub.add_parser("owid", help="Our World in Data grapher CSV")
    po.add_argument("csv_url")
    po.add_argument("entity")
    po.add_argument("column")
    po.add_argument("--label", default=None)

    pc = sub.add_parser("csv", help="generic public CSV")
    pc.add_argument("url")
    pc.add_argument("x_col")
    pc.add_argument("y_col")
    pc.add_argument("series_col", nargs="?", default=None)

    args = p.parse_args(argv)

    try:
        if args.source == "fred":
            rows = fetch_fred(args.series_id, args.since)
        elif args.source == "wb":
            rows = fetch_wb(args.indicator, args.country)
            if args.label:
                for r in rows:
                    r["series"] = args.label
        elif args.source == "owid":
            rows = fetch_owid(args.csv_url, args.entity, args.column)
            if args.label:
                for r in rows:
                    r["series"] = args.label
        elif args.source == "csv":
            rows = fetch_csv(args.url, args.x_col, args.y_col, args.series_col)
        else:  # pragma: no cover — argparse enforces choices
            return 2
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as e:
        print(
            f"FETCH FAILED ({type(e).__name__}: {e}). "
            "Fall back to a <DataTable> citing numbers directly from the brief's "
            "source items — do NOT fabricate chart data.",
            file=sys.stderr,
        )
        return 1
    except (RuntimeError, ValueError, json.JSONDecodeError) as e:
        print(f"PARSE FAILED: {e}", file=sys.stderr)
        return 1

    json.dump(rows, sys.stdout, indent=2)
    print()  # trailing newline
    print(f"\n{len(rows)} rows fetched.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
