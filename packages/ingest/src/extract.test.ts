import { expect, test } from "vitest";
import { extractArticle, sanitizeArticleHtml } from "./extract.js";

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

test("sanitizeArticleHtml strips dangerous schemes and tags", () => {
  const dirty = `<p>ok</p><a href="javascript:alert(1)">x</a><script>bad()</script><img src="data:image/png;base64,AAAA">`;
  const clean = sanitizeArticleHtml(dirty);
  expect(clean).toContain("<p>ok</p>");
  expect(clean).not.toContain("javascript:");
  expect(clean).not.toContain("<script");
  expect(clean).not.toContain("data:image");
});
