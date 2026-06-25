import { expect, test } from "vitest";
import {
  extractArticle,
  extractMetaText,
  extractWithArticleExtractor,
  findAmpUrl,
  htmlToText,
  sanitizeArticleHtml,
} from "./extract.js";

const ARTICLE_HTML = `<!doctype html><html><head><title>Edge Scaling</title>
<style>.ad{display:none}</style><script>track()</script></head>
<body>
  <nav>home about</nav>
  <article>
    <h1>How We Scaled the Edge</h1>
    <p>${"The edge tier handles millions of requests per second. ".repeat(20)}</p>
    <p>We rearchitected the routing layer and <a href="https://example.com/post" onclick="x()">documented it here</a>.</p>
    <blockquote>Latency dropped by 40 percent across regions.</blockquote>
    <ul><li>caching</li><li>sharding</li></ul>
    <img src="https://example.com/diagram.png" alt="architecture" onerror="hack()" />
    <script>steal()</script>
    <iframe src="https://evil.com"></iframe>
  </article>
  <footer>copyright</footer>
</body></html>`;

test("extracts main article content as sanitized HTML + plain text", () => {
  const out = extractArticle(ARTICLE_HTML, "https://blog.example.com/edge");
  expect(out).not.toBeNull();
  const { html, text } = out!;
  // Kept structural/readable tags.
  expect(html).toContain("<p>");
  expect(html).toContain("<blockquote>");
  expect(html).toContain("<li>caching</li>");
  expect(html).toContain('href="https://example.com/post"');
  // Stripped scripts/styles/iframes and event handlers.
  expect(html).not.toContain("<script");
  expect(html).not.toContain("<style");
  expect(html).not.toContain("<iframe");
  expect(html).not.toContain("onclick");
  expect(html).not.toContain("onerror");
  // External links hardened.
  expect(html).toContain('rel="noopener noreferrer"');
  // Plain text is substantial and free of markup.
  expect(text).toContain("edge tier handles millions");
  expect(text).not.toContain("<");
  expect(text.length).toBeGreaterThan(600);
});

test("returns null on empty / unparseable input", () => {
  expect(extractArticle("", "https://x.com")).toBeNull();
  expect(extractArticle("   ", "https://x.com")).toBeNull();
});

test("returns null when there is no recoverable article body", () => {
  const out = extractArticle("<html><body><div></div></body></html>", "https://x.com/empty");
  expect(out).toBeNull();
});

test("htmlToText strips markup and collapses whitespace", () => {
  expect(htmlToText("<p>hello   <b>world</b></p>\n<p>again</p>")).toBe("hello world again");
  expect(htmlToText("")).toBe("");
});

test("extractWithArticleExtractor recovers article text from raw HTML (offline)", async () => {
  const html = `<html><head><title>T</title></head><body><article><h1>Real Title Here</h1><p>${"This is a genuine article paragraph with enough words to clear the threshold. ".repeat(20)}</p></article></body></html>`;
  const out = await extractWithArticleExtractor(html, "https://blog.example.com/a");
  expect(out).not.toBeNull();
  expect(out!.html).toContain("<p>");
  expect(out!.text).toContain("genuine article paragraph");
  expect(out!.text.length).toBeGreaterThan(600);
  // Sanitized through our allowlist.
  expect(out!.html).not.toContain("<script");
});

test("extractWithArticleExtractor returns null on empty input", async () => {
  expect(await extractWithArticleExtractor("", "https://x.com")).toBeNull();
  expect(await extractWithArticleExtractor("   ", "https://x.com")).toBeNull();
});

test("findAmpUrl resolves a relative amphtml link against the base URL", () => {
  const html = `<html><head><link rel="amphtml" href="/amp/post"></head><body></body></html>`;
  expect(findAmpUrl(html, "https://news.example.com/post")).toBe("https://news.example.com/amp/post");
  expect(findAmpUrl("<html><head></head></html>", "https://news.example.com/post")).toBeNull();
});

test("extractMetaText falls back to JSON-LD articleBody, then og:description", () => {
  const longBody = "Article body sentence from structured data. ".repeat(10);
  const withLd = `<html><head>
    <meta property="og:description" content="short og description">
    <script type="application/ld+json">${JSON.stringify({ "@type": "Article", articleBody: longBody })}</script>
  </head><body></body></html>`;
  const out = extractMetaText(withLd, "https://x.com/a");
  expect(out).not.toBeNull();
  expect(out!.html).toContain("<p>");
  expect(out!.text).toContain("structured data");

  const ogOnly = `<html><head><meta name="description" content="just a meta description"></head><body></body></html>`;
  const out2 = extractMetaText(ogOnly, "https://x.com/b");
  expect(out2!.text).toBe("just a meta description");

  expect(extractMetaText("<html><head></head><body></body></html>", "https://x.com/c")).toBeNull();
});

test("sanitizeArticleHtml strips dangerous schemes and tags", () => {
  const dirty = `<p>ok</p><a href="javascript:alert(1)">x</a><script>bad()</script><img src="data:image/png;base64,AAAA">`;
  const clean = sanitizeArticleHtml(dirty);
  expect(clean).toContain("<p>ok</p>");
  expect(clean).not.toContain("javascript:");
  expect(clean).not.toContain("<script");
  expect(clean).not.toContain("data:image");
});
