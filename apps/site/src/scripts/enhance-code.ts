// enhance-code.ts — progressive enhancement for code blocks in the reading
// column. Runs on BOTH the MDX Reads page and the in-app reader (extracted
// HTML), so every `.prose pre` gets the same lang tag + copy affordance. With
// no JS the bare <pre> (styled in code.css) stands alone — nothing here is
// required for the block to be beautiful or readable.
//
// Accessible, reduced-motion safe, no layout shift (the bar is absolutely
// positioned inside the pre's reserved top bezel band). Idempotent: a
// `data-enhanced` flag guards against double-wrapping on View-Transition
// re-runs.

const COPY_ICON = `<svg class="code-block__copy-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.4"/><path d="M10.5 5.5V3.4A1.4 1.4 0 0 0 9.1 2H3.4A1.4 1.4 0 0 0 2 3.4v5.7A1.4 1.4 0 0 0 3.4 10.5h2.1"/></svg>`;
const CHECK_ICON = `<svg class="code-block__copy-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5"/></svg>`;

/** Best-effort language label from Shiki's data-language or a language-* class. */
function detectLang(pre: HTMLPreElement): string | null {
  const fromPre = pre.getAttribute("data-language");
  if (fromPre && fromPre !== "plaintext" && fromPre !== "text") return fromPre;
  const code = pre.querySelector("code");
  const cls = code?.className.match(/language-([\w+-]+)/);
  if (cls?.[1] && cls[1] !== "plaintext" && cls[1] !== "text") return cls[1];
  return null;
}

function copyText(pre: HTMLPreElement): string {
  // The <code> text without the injected bar; fall back to pre.textContent.
  const code = pre.querySelector("code");
  return (code?.textContent ?? pre.textContent ?? "").replace(/\n$/, "");
}

function enhanceOne(pre: HTMLPreElement): void {
  if (pre.dataset.enhanced === "true") return;
  pre.dataset.enhanced = "true";

  const wrap = document.createElement("div");
  wrap.className = "code-block";
  pre.parentNode?.insertBefore(wrap, pre);
  wrap.appendChild(pre);

  const bar = document.createElement("div");
  bar.className = "code-block__bar";

  const lang = detectLang(pre);
  if (lang) {
    const tag = document.createElement("span");
    tag.className = "code-block__lang";
    tag.textContent = lang;
    bar.appendChild(tag);
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "code-block__copy";
  btn.setAttribute("aria-label", "Copy code to clipboard");
  btn.innerHTML = `${COPY_ICON}<span class="code-block__copy-label">copy</span>`;

  let resetTimer: number | undefined;
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(copyText(pre));
    } catch {
      // Clipboard blocked (insecure context / denied). Fail quietly — the code
      // is still selectable; we don't pretend it copied.
      return;
    }
    btn.dataset.copied = "true";
    btn.innerHTML = `${CHECK_ICON}<span class="code-block__copy-label">copied</span>`;
    btn.setAttribute("aria-label", "Code copied");
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      delete btn.dataset.copied;
      btn.innerHTML = `${COPY_ICON}<span class="code-block__copy-label">copy</span>`;
      btn.setAttribute("aria-label", "Copy code to clipboard");
    }, 1800);
  });

  bar.appendChild(btn);
  wrap.appendChild(bar);
}

function enhanceAll(): void {
  document
    .querySelectorAll<HTMLPreElement>(".prose pre")
    .forEach(enhanceOne);
}

enhanceAll();
// Re-run after Astro View Transitions swap the document.
document.addEventListener("astro:page-load", enhanceAll);
