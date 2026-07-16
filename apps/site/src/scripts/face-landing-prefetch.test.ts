import { afterEach, describe, expect, it, vi } from "vitest";
import { installFaceLandingPrefetch } from "./face-landing-prefetch.ts";

type Listener = (event: { key?: string }) => void;

class FakeAnchor {
  readonly listeners = new Map<string, Listener[]>();

  constructor(readonly href: string) {}

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatch(type: string, event: { key?: string } = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakePrefetchLink {
  readonly attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
}

class FakeDocument {
  readonly links: FakePrefetchLink[] = [];
  readonly selectors: string[] = [];

  constructor(
    readonly faceSwitch: FakeAnchor | null,
    readonly nonSwitch: FakeAnchor | null = null,
  ) {}

  readonly head = {
    append: (node: FakePrefetchLink) => {
      this.links.push(node);
    },
  };

  querySelector<T>(selector: string): T | null {
    this.selectors.push(selector);
    if (selector === "a[data-face-switch]") return this.faceSwitch as T | null;
    if (selector.startsWith("link[rel=\"prefetch\"]")) {
      const href = selector.match(/href="([^"]+)"/)?.[1];
      return (this.links.find((link) => link.getAttribute("href") === href) ?? null) as T | null;
    }
    return null;
  }

  createElement(tagName: string): FakePrefetchLink {
    if (tagName !== "link") throw new Error(`Unexpected element: ${tagName}`);
    return new FakePrefetchLink();
  }
}

function install(document: FakeDocument, supportsSpeculationRules: boolean): void {
  installFaceLandingPrefetch({
    document,
    htmlScriptElement: {
      supports: vi.fn(() => supportsSpeculationRules),
    },
    setTimeout,
    clearTimeout,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("installFaceLandingPrefetch", () => {
  it("does nothing in engines that support Speculation Rules", () => {
    const switchLink = new FakeAnchor("https://example.test/khazana/atlas");
    const document = new FakeDocument(switchLink);

    install(document, true);
    switchLink.dispatch("pointerenter");
    switchLink.dispatch("pointerdown");

    expect(document.links).toHaveLength(0);
    expect(switchLink.listeners.size).toBe(0);
    expect(document.selectors).toEqual([]);
  });

  it("prefetches the resolved opposite landing once after moderate hover or focus intent", () => {
    vi.useFakeTimers();
    const switchLink = new FakeAnchor("https://example.test/khazana/atlas");
    const document = new FakeDocument(switchLink);

    install(document, false);
    switchLink.dispatch("pointerenter");
    vi.advanceTimersByTime(199);
    expect(document.links).toHaveLength(0);

    switchLink.dispatch("focus");
    vi.advanceTimersByTime(200);

    expect(document.links).toHaveLength(1);
    expect(document.links[0]?.getAttribute("rel")).toBe("prefetch");
    expect(document.links[0]?.getAttribute("href")).toBe("https://example.test/khazana/atlas");
  });

  it("keeps repeated hover, focus, and immediate activation intent idempotent", () => {
    vi.useFakeTimers();
    const switchLink = new FakeAnchor("https://example.test/khazana/");
    const document = new FakeDocument(switchLink);

    install(document, false);
    switchLink.dispatch("pointerenter");
    switchLink.dispatch("focus");
    switchLink.dispatch("pointerdown");
    switchLink.dispatch("keydown", { key: "Enter" });
    vi.advanceTimersByTime(500);

    expect(document.links).toHaveLength(1);
    expect(document.links[0]?.getAttribute("href")).toBe("https://example.test/khazana/");
  });

  it("reuses an existing matching prefetch hint", () => {
    const switchLink = new FakeAnchor("https://example.test/khazana/atlas");
    const document = new FakeDocument(switchLink);
    const existingHint = new FakePrefetchLink();
    existingHint.setAttribute("rel", "prefetch");
    existingHint.setAttribute("href", switchLink.href);
    document.links.push(existingHint);

    install(document, false);
    switchLink.dispatch("pointerdown");

    expect(document.links).toEqual([existingHint]);
  });

  it("never inspects or prefetches a non-switch URL", () => {
    vi.useFakeTimers();
    const switchLink = new FakeAnchor("https://example.test/khazana/atlas");
    const railLink = new FakeAnchor("https://example.test/khazana/atlas/browser");
    const document = new FakeDocument(switchLink, railLink);

    install(document, false);
    railLink.dispatch("pointerenter");
    vi.advanceTimersByTime(500);

    expect(document.links).toHaveLength(0);
    expect(document.selectors).toEqual(["a[data-face-switch]"]);
  });
});
