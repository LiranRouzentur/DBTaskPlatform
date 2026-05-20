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
  // Parse once — `Date.parse` returns NaN for malformed ISO, which we surface as the original string.
  const t = Date.parse(iso);
  // Defensive fallback — the UI prefers showing the raw input over `NaN ago`.
  if (Number.isNaN(t)) return iso;

  // Signed delta: positive = past, negative = future. Kept signed so the future flag below is cheap.
  const diff = now - t;
  // Magnitude drives the threshold table; sign is handled separately by `future`.
  const absDiff = Math.abs(diff);
  // Tense flag — passed to `formatUnit` so "in 5m" / "5m ago" share one path.
  const future = diff < 0;

  // Sub-minute slop bucket — "just now" reads better than "0m ago" or "1s".
  if (absDiff < 45 * SECOND) return 'just now';
  // Edge: 45s–1min, still sub-minute but no longer "just now"; vague phrasing avoids fake precision.
  if (absDiff < MINUTE) return future ? 'in a few seconds' : 'a few seconds ago';
  // Standard m/h/d/w/mo/y ladder — each branch hands off to the shared unit renderer.
  if (absDiff < HOUR) return formatUnit(absDiff, MINUTE, 'm', future);
  if (absDiff < DAY) return formatUnit(absDiff, HOUR, 'h', future);
  // Special-case the single-day boundary — "yesterday"/"tomorrow" reads more naturally than "1d ago".
  if (absDiff < 2 * DAY) return future ? 'tomorrow' : 'yesterday';
  if (absDiff < WEEK) return formatUnit(absDiff, DAY, 'd', future);
  if (absDiff < MONTH) return formatUnit(absDiff, WEEK, 'w', future);
  if (absDiff < YEAR) return formatUnit(absDiff, MONTH, 'mo', future);
  // Anything older than a year falls through to year granularity — no centuries bucket needed.
  return formatUnit(absDiff, YEAR, 'y', future);
}

/** Shared per-unit renderer; floors with a minimum of 1 so `< 1 unit` doesn't render `0m ago`. */
function formatUnit(diff: number, unit: number, label: string, future: boolean): string {
  // `Math.max(1, …)` guards the 0-floor case at the lower edge of each bucket (e.g. 59s when reaching the minute branch).
  const n = Math.max(1, Math.floor(diff / unit));
  // Tense-specific template — keeps the threshold table above free of string concat.
  return future ? `in ${n}${label}` : `${n}${label} ago`;
}

/** Long-form absolute timestamp used in tooltips / `title` attributes alongside the relative label. */
export function formatAbsolute(iso: string): string {
  // Same parse-and-fallback shape as `formatRelativeTime` so tooltips never display `Invalid Date`.
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  // Local Date so `toLocaleString` formats in the user's timezone.
  const d = new Date(t);
  // `undefined` locale = browser default; explicit option set keeps the format stable across browsers.
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
