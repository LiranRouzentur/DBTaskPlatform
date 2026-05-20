// Locale-agnostic relative-time formatter (no Intl.RelativeTimeFormat — smaller bundle, stable
// short labels). `now` is injectable so tests can pin a deterministic timestamp.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

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

function formatUnit(diff: number, unit: number, label: string, future: boolean): string {
  const n = Math.max(1, Math.floor(diff / unit));
  return future ? `in ${n}${label}` : `${n}${label} ago`;
}

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
