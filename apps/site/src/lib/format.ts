const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;

/** Compact relative time, e.g. "now", "30m", "3h", "2d", "1y". `now` injected for determinism. */
export function timeAgo(iso: string, now: Date): string {
  const then = Date.parse(iso);
  const delta = now.getTime() - then;
  if (Number.isNaN(then) || delta < MIN) return "now";
  if (delta < HOUR) return `${Math.floor(delta / MIN)}m`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h`;
  if (delta < YEAR) return `${Math.floor(delta / DAY)}d`;
  return `${Math.floor(delta / YEAR)}y`;
}

/** "YYYY-MM-DD HH:mm" in UTC, for the footer build stamp. */
export function formatBuildTime(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}
