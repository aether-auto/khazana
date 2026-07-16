const PREFETCH_DELAY_MS = 200;
const PREFETCH_MARKER = "data-face-landing-prefetch";

type Timer = ReturnType<typeof globalThis.setTimeout>;

export interface FaceLandingPrefetchOptions {
  document?: unknown;
  htmlScriptElement?: unknown;
  setTimeout?: (callback: () => void, delay: number) => Timer;
  clearTimeout?: (timer: Timer) => void;
}

interface FaceSwitchAnchor {
  href: string;
  addEventListener(type: string, listener: (event: unknown) => void): void;
}

interface PrefetchDocument {
  head: { append(node: unknown): unknown };
  querySelector(selector: string): unknown;
  createElement(tagName: string): unknown;
}

interface PrefetchLink {
  setAttribute(name: string, value: string): void;
}

function hasSpeculationRulesSupport(htmlScriptElement: unknown): boolean {
  if ((typeof htmlScriptElement !== "object" && typeof htmlScriptElement !== "function") || !htmlScriptElement) {
    return false;
  }

  const supports = (htmlScriptElement as { supports?: unknown }).supports;
  return typeof supports === "function" && supports.call(htmlScriptElement, "speculationrules") === true;
}

function isFaceSwitchAnchor(node: unknown): node is FaceSwitchAnchor {
  if (typeof node !== "object" || !node) return false;
  const candidate = node as { href?: unknown; addEventListener?: unknown };
  return typeof candidate.href === "string" && typeof candidate.addEventListener === "function";
}

function isActivationKey(event: unknown): boolean {
  if (typeof event !== "object" || !event) return false;
  const key = (event as { key?: unknown }).key;
  return key === "Enter" || key === " ";
}

function selectorForPrefetch(href: string): string {
  return `link[rel="prefetch"][href="${href.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"]`;
}

/**
 * Install old-engine hinting for single opposite-face bezel control.
 * Supporting engines use inline Speculation Rules only.
 */
export function installFaceLandingPrefetch(options: FaceLandingPrefetchOptions = {}): void {
  const htmlScriptElement = options.htmlScriptElement ??
    (typeof HTMLScriptElement === "undefined" ? undefined : HTMLScriptElement);
  if (hasSpeculationRulesSupport(htmlScriptElement)) return;

  const document = options.document ?? (typeof globalThis.document === "undefined" ? undefined : globalThis.document);
  if (!document) return;
  const prefetchDocument = document as PrefetchDocument;
  const faceSwitch = prefetchDocument.querySelector("a[data-face-switch]");
  if (!isFaceSwitchAnchor(faceSwitch)) return;

  const scheduleTimer = options.setTimeout ?? ((callback: () => void, delay: number) => globalThis.setTimeout(callback, delay));
  const cancelTimer = options.clearTimeout ?? ((timer: Timer) => globalThis.clearTimeout(timer));
  let timer: Timer | null = null;
  let prefetched = false;

  const prefetch = (): void => {
    if (timer !== null) {
      cancelTimer(timer);
      timer = null;
    }
    if (prefetched) return;

    const href = faceSwitch.href;
    const existingHint = prefetchDocument.querySelector(selectorForPrefetch(href));
    if (existingHint) {
      prefetched = true;
      return;
    }

    const hint = prefetchDocument.createElement("link") as PrefetchLink;
    hint.setAttribute("rel", "prefetch");
    hint.setAttribute("href", href);
    hint.setAttribute(PREFETCH_MARKER, "");
    prefetchDocument.head.append(hint);
    prefetched = true;
  };

  const schedulePrefetch = (): void => {
    if (prefetched || timer !== null) return;
    timer = scheduleTimer(() => {
      timer = null;
      prefetch();
    }, PREFETCH_DELAY_MS);
  };

  faceSwitch.addEventListener("pointerenter", schedulePrefetch);
  faceSwitch.addEventListener("focus", schedulePrefetch);
  faceSwitch.addEventListener("pointerdown", prefetch);
  faceSwitch.addEventListener("keydown", (event) => {
    if (isActivationKey(event)) prefetch();
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  installFaceLandingPrefetch();
}
