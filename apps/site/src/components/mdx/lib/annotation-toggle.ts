// apps/site/src/components/mdx/lib/annotation-toggle.ts
// Pure helpers for Annotation open/close logic — extracted for testability.

/**
 * Toggle the open state on click/tap. Always flips: open→closed, closed→open.
 */
export function toggleOpen(current: boolean): boolean {
  return !current;
}

/**
 * Keyboard handler for the term button.
 * - Escape: always closes (if open).
 * - Enter/Space: already handled natively by <button>; we don't handle here.
 * Returns the next open state, or null if the key is unhandled (caller ignores).
 */
export function handleKeyDown(key: string, open: boolean): boolean | null {
  if (key === "Escape" && open) return false;
  return null;
}

/**
 * Returns true when a pointer-down/click target is OUTSIDE the annotation
 * container — meaning the popover should close.
 *
 * `container` is the `.mdx-annot` wrapper element.
 * `target` is the event.target from the document-level listener.
 */
export function isOutsideClick(
  target: EventTarget | null,
  container: Element | null,
): boolean {
  if (!container || !target) return false;
  return !container.contains(target as Node);
}
