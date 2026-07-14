/**
 * lib/recurrence.ts — due-date arithmetic for recurring todos.
 *
 * Owner: Person C (Wave 3).
 * All dates are Singapore-local ISO strings (YYYY-MM-DDTHH:mm:ss, no offset).
 */

import type { RecurrencePattern } from './db';

/** Returns the number of days in a given month (month is 1-based). */
function daysInMonth(year: number, month1to12: number): number {
  // Date.UTC(year, month1to12, 0) gives the last day of month1to12-1, i.e. month1to12-1+1 = month1to12
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/** Parses a Singapore-local ISO string into its constituent parts. */
function parseDateParts(isoString: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  // Expected format: YYYY-MM-DDTHH:mm:ss or YYYY-MM-DDTHH:mm
  const [datePart, timePart = '00:00:00'] = isoString.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  return { year, month, day, hour, minute };
}

/** Builds a Singapore-local ISO string from parts. Seconds are always 00. */
function buildISO(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  const p = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${p(year, 4)}-${p(month)}-${p(day)}T${p(hour)}:${p(minute)}:00`;
}

/**
 * Computes the next due date for a recurring todo by advancing the current
 * Singapore-local `due_date` by one recurrence unit.
 *
 * Rules:
 * - daily   → +1 day
 * - weekly  → +7 days
 * - monthly → same day next month; clamps to last day if the target month is
 *             shorter (e.g. Jan 31 → Feb 28/29).
 * - yearly  → same day/month next year; Feb 29 → Feb 28 on non-leap years.
 *
 * Time-of-day (hour:minute) is always preserved.
 */
export function calculateNextDueDate(
  currentDueDate: string,
  pattern: RecurrencePattern,
): string {
  const { year, month, day, hour, minute } = parseDateParts(currentDueDate);

  switch (pattern) {
    case 'daily': {
      // Use UTC arithmetic so JS Date handles month/year rollovers automatically.
      const d = new Date(Date.UTC(year, month - 1, day + 1));
      return buildISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hour, minute);
    }
    case 'weekly': {
      const d = new Date(Date.UTC(year, month - 1, day + 7));
      return buildISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hour, minute);
    }
    case 'monthly': {
      const targetMonth = month === 12 ? 1 : month + 1;
      const targetYear = month === 12 ? year + 1 : year;
      // Clamp day to avoid JS Date overflow (e.g. Jan 31 + 1 month ≠ Mar 3).
      const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));
      return buildISO(targetYear, targetMonth, clampedDay, hour, minute);
    }
    case 'yearly': {
      const targetYear = year + 1;
      // Feb 29 on a non-leap target year clamps to Feb 28.
      const clampedDay = Math.min(day, daysInMonth(targetYear, month));
      return buildISO(targetYear, month, clampedDay, hour, minute);
    }
  }
}
