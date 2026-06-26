import { expect, test, describe } from "vitest";
import {
  extractArticle,
  extractMetaText,
  extractWithArticleExtractor,
  findAmpUrl,
  htmlToText,
  sanitizeArticleHtml,
  stripBoilerplate,
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

// ---------------------------------------------------------------------------
// Boilerplate-stripping tests (TDD — these drive the stripBoilerplate feature)
// ---------------------------------------------------------------------------

// Fixture: nav-list leaked to the top (Quantum Computing Report pattern)
const NAV_LEAK_FIXTURE = `
<a href="https://site.com/#content" rel="noopener noreferrer" target="_blank">Skip to content</a>
<ul>
  <li><a href="https://site.com/about/" rel="noopener noreferrer" target="_blank"><span>About</span></a></li>
  <li><a href="https://site.com/news/" rel="noopener noreferrer" target="_blank"><span>News</span></a>
    <ul>
      <li><a href="https://site.com/news/2025/" rel="noopener noreferrer" target="_blank"><span>Archive 2025</span></a></li>
      <li><a href="https://site.com/news/2024/" rel="noopener noreferrer" target="_blank"><span>Archive 2024</span></a></li>
    </ul>
  </li>
  <li><a href="https://site.com/contact/" rel="noopener noreferrer" target="_blank"><span>Contact</span></a></li>
</ul>
<h1>NSF Selects Five Teams in National Quantum Initiative</h1>
<p>The National Science Foundation has selected five additional research teams to participate in the National Quantum Virtual Laboratory design competition, expanding the program significantly. These teams will work on developing next-generation quantum computing infrastructure that could benefit the broader scientific community.</p>
<p>Each selected team brings unique expertise in quantum error correction, quantum networking, and hybrid classical-quantum algorithms. The competition aims to establish a shared virtual laboratory environment accessible to researchers nationwide.</p>
`.trim();

// Fixture: social-share row + cookie notice
const SOCIAL_SHARE_FIXTURE = `
<p class="share">Share: <a href="https://twitter.com/share">Twitter</a> <a href="https://facebook.com/share">Facebook</a> <a href="https://linkedin.com/share">LinkedIn</a></p>
<div class="cookie-notice"><a href="#accept">Accept cookies</a> <a href="#decline">Decline</a></div>
<h2>How Netflix Simplified Batch Compute with Kueue</h2>
<p>As a part of the infrastructure modernization effort at Netflix, the compute platform team has been working to simplify how batch workloads are scheduled and managed across our fleet of machines. This post describes the journey from our legacy batch system to Kueue, a Kubernetes-native job queuing solution.</p>
<p>The migration involved careful planning across multiple teams and required us to maintain backward compatibility throughout the transition period while achieving significant improvements in resource utilization and operational simplicity.</p>
`.trim();

// Fixture: leading R-bloggers style site nav wrapped in anchor + list
const RBLOGGERS_FIXTURE = `
<a href="https://www.r-bloggers.com/" title="R-bloggers" rel="noopener noreferrer" target="_blank">
<img src="https://www.r-bloggers.com/logo.webp" alt="R-bloggers" />
<h2>R news and tutorials contributed by hundreds of R bloggers</h2>
</a>
<ul>
  <li><a href="https://www.r-bloggers.com/" rel="noopener noreferrer" target="_blank">Home</a></li>
  <li><a href="https://www.r-bloggers.com/about/" rel="noopener noreferrer" target="_blank">About</a></li>
  <li><a href="https://feeds.feedburner.com/RBloggers" rel="noopener noreferrer" target="_blank">RSS</a></li>
  <li><a href="https://www.r-bloggers.com/add-your-blog/" rel="noopener noreferrer" target="_blank">add your blog!</a></li>
  <li><a href="https://www.r-bloggers.com/jobs/" rel="noopener noreferrer" target="_blank">R jobs</a></li>
</ul>
<h2>Set Working Directory in R: setwd() &amp; RStudio GUI Guide</h2>
<p>The setwd() function in R allows you to change your current working directory to any path you specify. This is particularly useful when working with files that are not in your default directory. Understanding how to manage working directories is a fundamental skill for any R programmer.</p>
<p>In RStudio, you can also change the working directory through the graphical interface via Session menu, which provides a more visual way to navigate your file system without needing to know the exact path.</p>
`.trim();

// Fixture: related-posts link list at the bottom
const RELATED_POSTS_FIXTURE = `
<h1>Understanding Convolutions on Graphs</h1>
<p>Graph neural networks have emerged as a powerful tool for learning representations of graph-structured data. Unlike standard neural networks that operate on grid-like structures, GNNs must handle the irregular connectivity patterns inherent in graph data.</p>
<p>The key challenge in applying convolutions to graphs is defining a consistent neighborhood aggregation operation that respects the graph topology while remaining computationally tractable for large-scale graphs with millions of nodes.</p>
<ul>
  <li><a href="https://site.com/related/post-1">Introduction to Graph Theory</a></li>
  <li><a href="https://site.com/related/post-2">Spectral Graph Convolutions</a></li>
  <li><a href="https://site.com/related/post-3">Message Passing Neural Networks</a></li>
  <li><a href="https://site.com/related/post-4">Graph Attention Networks</a></li>
</ul>
`.trim();

// Fixture: subscribe/sign-in standalone anchors
const SUBSCRIBE_FIXTURE = `
<a href="https://newsletter.example.com/subscribe">Subscribe</a>
<a href="https://example.com/signin">Sign in</a>
<a href="https://example.com/menu">Menu</a>
<h1>The new inner game: Your unfair advantage in the age of AI</h1>
<p>In the age of AI, the most important competitive advantage is not raw technical skill or access to the best tools. It is the ability to direct intelligence — to know what to build, why it matters, and how to maintain quality while moving fast.</p>
<p>The founders who will win in this environment are those who understand that AI amplifies existing taste and judgment rather than replacing it. Mediocre direction produces mediocre output at scale; excellent direction produces compounding excellence.</p>
`.trim();

// Fixture: legitimate content that must NOT be stripped (list-heavy content article)
const LEGITIMATE_LIST_FIXTURE = `
<h1>The Best Programming Languages for Data Science in 2026</h1>
<p>Choosing the right programming language for data science depends heavily on your use case, team, and the specific problems you are trying to solve. Here is a comprehensive overview of the most important options available today.</p>
<ul>
  <li>Python remains the dominant language for data science due to its extensive ecosystem and readability.</li>
  <li>R excels at statistical computing and has outstanding visualization libraries like ggplot2.</li>
  <li>Julia offers near-C performance for numerical computing with Python-like syntax.</li>
  <li>SQL is irreplaceable for data querying and manipulation at the database layer.</li>
</ul>
<p>The right choice ultimately depends on your team composition and the specific demands of your analytical pipeline. Most mature data science teams use a combination of Python and SQL as their core stack.</p>
`.trim();

describe("stripBoilerplate", () => {
  test("removes leading skip-to-content link and nav link-list before first real paragraph", () => {
    const result = stripBoilerplate(NAV_LEAK_FIXTURE);
    // Nav link-list should be gone
    expect(result).not.toContain("Skip to content");
    expect(result).not.toContain("Archive 2025");
    expect(result).not.toContain("Archive 2024");
    // Real article content must survive
    expect(result).toContain("NSF Selects Five Teams");
    expect(result).toContain("National Science Foundation");
    expect(result).toContain("quantum error correction");
  });

  test("removes social-share row and cookie notice before article prose", () => {
    const result = stripBoilerplate(SOCIAL_SHARE_FIXTURE);
    expect(result).not.toContain("Accept cookies");
    expect(result).not.toContain("Twitter");
    // Real content must survive
    expect(result).toContain("How Netflix Simplified");
    expect(result).toContain("Kueue");
    expect(result).toContain("resource utilization");
  });

  test("removes R-bloggers site nav (dense link-list block) before real article heading and prose", () => {
    const result = stripBoilerplate(RBLOGGERS_FIXTURE);
    expect(result).not.toContain("add your blog!");
    expect(result).not.toContain("R jobs");
    // The R-bloggers site nav list items should be gone
    const text = result.replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/\bHome\b.*\bAbout\b.*\bRSS\b/s);
    // Real content must survive
    expect(result).toContain("Set Working Directory");
    expect(result).toContain("setwd()");
    expect(result).toContain("fundamental skill");
  });

  test("removes standalone subscribe/sign-in/menu anchors before real prose", () => {
    const result = stripBoilerplate(SUBSCRIBE_FIXTURE);
    const text = result.replace(/<[^>]+>/g, " ").trim();
    // Standalone nav anchors stripped
    expect(text).not.toMatch(/^\s*Subscribe/);
    expect(text).not.toMatch(/^\s*Sign in/);
    expect(text).not.toMatch(/^\s*Menu/);
    // Article heading and prose survives
    expect(result).toContain("The new inner game");
    expect(result).toContain("competitive advantage");
    expect(result).toContain("Mediocre direction");
  });

  test("does NOT strip legitimate content lists that are actual article substance", () => {
    const result = stripBoilerplate(LEGITIMATE_LIST_FIXTURE);
    // Article list items must survive — they are real content
    expect(result).toContain("Python remains the dominant");
    expect(result).toContain("R excels at statistical");
    expect(result).toContain("Julia offers near-C");
    expect(result).toContain("SQL is irreplaceable");
    // Headings and prose survive
    expect(result).toContain("Best Programming Languages");
    expect(result).toContain("use case, team");
  });

  test("removes trailing related-posts pure-link list after article prose", () => {
    const result = stripBoilerplate(RELATED_POSTS_FIXTURE);
    // The trailing related-posts link list (all hrefs, no prose) should be gone
    expect(result).not.toContain("Introduction to Graph Theory");
    expect(result).not.toContain("Spectral Graph Convolutions");
    // Core article prose must survive
    expect(result).toContain("Graph neural networks");
    expect(result).toContain("irregular connectivity");
    expect(result).toContain("computationally tractable");
  });

  test("returns empty string unchanged, does not crash", () => {
    expect(stripBoilerplate("")).toBe("");
    expect(stripBoilerplate("   ")).toBe("");
  });

  test("passes through clean prose-only HTML with no boilerplate", () => {
    const clean = `<h1>Clean Article</h1><p>This is a legitimate article with real prose content that is worth reading and should pass through unchanged. There are no nav links or boilerplate elements here at all.</p><p>Second paragraph with more substance.</p>`;
    const result = stripBoilerplate(clean);
    expect(result).toContain("Clean Article");
    expect(result).toContain("legitimate article");
    expect(result).toContain("Second paragraph");
  });
});
