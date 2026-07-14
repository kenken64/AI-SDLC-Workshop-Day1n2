const TIMEZONE = 'Asia/Singapore';

/**
 * Returns the current time as a Singapore-local ISO string (YYYY-MM-DDTHH:mm:ss).
 * Use this everywhere instead of new Date().toISOString() so that stored strings
 * and comparisons are all in the same local timezone.
 */
export function getSingaporeNow(): string {
  return toSingaporeISOString(new Date());
}

/**
 * Converts a Date object or UTC ISO string to a Singapore-local ISO string.
 */
export function formatSingaporeDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return toSingaporeISOString(d);
}

/**
 * Returns only the YYYY-MM-DD portion in Singapore timezone.
 */
export function getSingaporeDateString(date?: Date): string {
  const d = date ?? new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(p => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function toSingaporeISOString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(p => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}
