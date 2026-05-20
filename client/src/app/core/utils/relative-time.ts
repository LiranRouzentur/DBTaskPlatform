// Locale-agnostic relative-time formatter (no Intl.RelativeTimeFormat — smaller bundle, stable
// short labels). `now` is injectable so tests can pin a deterministic timestamp.

/** Milliseconds in one second — base unit for the threshold table below. */
const SECOND = 1000;
/** Milliseconds in one minute. */
const MINUTE = 60 * SECOND;
/** Milliseconds in one hour. */
const HOUR = 60 * MINUTE;
/** Milliseconds in one day. */
const DAY = 24 * HOUR;
/** Milliseconds in one week. */
const WEEK = 7 * DAY;
/** Approximation — 30 days. Good enough for short labels; exact calendar math is overkill here. */
const MONTH = 30 * DAY;
/** Approximation — 365 days. Same rationale as MONTH. */
const YEAR = 365 * DAY;

/** Formats an ISO timestamp as a short relative label (e.g. `5m ago`, `in 2h`, `yesterday`).
 *  Returns the original string if parsing fails so the UI never shows `NaN`. */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;

  const diff = now - t;
  const absDiff = Math.abs(diff);
  const future = diff < 0;

  if (absDiff < 45 * SECOND) return 'just now';
  if (absDiff < MINUTE) return future ? 'in a few seconds' : 'a few seconds ago';
  if (absDiff < HOUR) return formatUnit(absDiff, MINUTE, 'm', future);
  if (absDiff < DAY) return formatUnit(absDiff, HOUR, 'h', future);
  if (absDiff < 2 * DAY) return future ? 'tomorrow' : 'yesterday';
  if (absDiff < WEEK) return formatUnit(absDiff, DAY, 'd', future);
  if (absDiff < MONTH) return formatUnit(absDiff, WEEK, 'w', future);
  if (absDiff < YEAR) return formatUnit(absDiff, MONTH, 'mo', future);
  return formatUnit(absDiff, YEAR, 'y', future);
}

/** Shared per-unit renderer; floors with a minimum of 1 so `< 1 unit` doesn't render `0m ago`. */
function formatUnit(diff: number, unit: number, label: string, future: boolean): string {
  const n = Math.max(1, Math.floor(diff / unit));
  return future ? `in ${n}${label}` : `${n}${label} ago`;
}

/** Long-form absolute timestamp used in tooltips / `title` attributes alongside the relative label. */
export function formatAbsolute(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
