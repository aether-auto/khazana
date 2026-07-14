#!/usr/bin/env python3
"""check-links.py — validate that every cited source URL is reachable.

Part of khazana's writer-skill Verify phase. A post is GROUNDED: every factual
claim traces to a real source article, and every source article's URL is listed
in the MDX frontmatter `sources:` array. This script confirms those URLs are
live (return a non-error HTTP status) before the post is committed.

Dependency-light by design: Python 3 standard library only (urllib). No paid
APIs, no third-party packages. Works offline-friendly — a network failure on a
single URL is reported, not crashed on.

USAGE
  # Check every source URL in an MDX file's frontmatter:
  python3 check-links.py path/to/post.mdx

  # Check one or more URLs directly:
  python3 check-links.py --url https://example.org/a --url https://example.org/b

  # Read URLs (one per line) from stdin:
  cat urls.txt | python3 check-links.py -

EXIT CODES
  0  all checked URLs returned a non-error status (< 400)
  1  at least one URL failed (>= 400, timeout, DNS error, or unreachable)
  2  bad invocation / no URLs found

The verify chain treats a non-zero exit as a BLOCKING failure: a draft that
cites a dead URL is not grounded and must not ship.
"""

from __future__ import annotations

import argparse
import re
import sys
import urllib.error
import urllib.request

TIMEOUT_S = 12
# A browser-ish UA: some hosts 403 the default urllib agent.
HEADERS = {"User-Agent": "Mozilla/5.0 (khazana-link-check/1.0)"}


def extract_frontmatter(text: str) -> str:
    """Return the YAML frontmatter block (between the first two '---' fences)."""
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    return m.group(1) if m else ""


def urls_from_frontmatter(fm: str) -> list[str]:
    """Pull every url: value out of the `sources:` list.

    Tolerates both block style:
        sources:
          - title: "X"
            url: "https://..."
    and flow style:
          - { title: "X", url: "https://..." }
    """
    urls: list[str] = []
    for m in re.finditer(r"url:\s*[\"']?(https?://[^\s\"'},]+)", fm):
        urls.append(m.group(1))
    return urls


def urls_from_mdx(path: str) -> list[str]:
    with open(path, "r", encoding="utf-8") as fh:
        text = fh.read()
    fm = extract_frontmatter(text)
    if not fm:
        print(f"WARN: no frontmatter found in {path}", file=sys.stderr)
    return urls_from_frontmatter(fm)


def check_url(url: str) -> tuple[bool, str]:
    """Return (ok, detail). Tries HEAD, falls back to GET (some hosts 405 HEAD)."""
    for method in ("HEAD", "GET"):
        req = urllib.request.Request(url, method=method, headers=HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                code = resp.getcode()
                if code < 400:
                    return True, f"{code}"
                if method == "HEAD":
                    continue  # retry with GET
                return False, f"HTTP {code}"
        except urllib.error.HTTPError as e:
            if e.code == 405 and method == "HEAD":
                continue  # method not allowed — retry with GET
            if e.code < 400:
                return True, f"{e.code}"
            return False, f"HTTP {e.code}"
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            if method == "HEAD":
                continue  # retry with GET before declaring dead
            return False, f"{type(e).__name__}: {e}"
    return False, "unreachable"


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(
        description="Validate that cited source URLs are reachable (writer Verify phase).",
        epilog="Exit 0 = all live, 1 = a URL failed, 2 = bad invocation.",
    )
    p.add_argument("mdx", nargs="?", help="Path to an MDX file (reads sources[].url), or '-' for stdin URLs")
    p.add_argument("--url", action="append", default=[], help="Check a URL directly (repeatable)")
    args = p.parse_args(argv)

    urls: list[str] = list(args.url)
    if args.mdx == "-":
        urls += [ln.strip() for ln in sys.stdin if ln.strip()]
    elif args.mdx:
        urls += urls_from_mdx(args.mdx)

    # de-dup, preserve order
    seen: set[str] = set()
    urls = [u for u in urls if not (u in seen or seen.add(u))]

    if not urls:
        print("No URLs to check. Pass an MDX file, --url, or pipe URLs on stdin.", file=sys.stderr)
        return 2

    failures = 0
    for url in urls:
        ok, detail = check_url(url)
        mark = "OK  " if ok else "FAIL"
        print(f"{mark} {detail:<24} {url}")
        if not ok:
            failures += 1

    print(f"\n{len(urls) - failures}/{len(urls)} reachable.", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
