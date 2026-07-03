const SINGAPORE_TZ = 'Asia/Singapore';

export function getSingaporeNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: SINGAPORE_TZ }));
}

export function formatSingaporeDate(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString('en-SG', {
    timeZone: SINGAPORE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function toSingaporeISOString(date: Date): string {
  // Returns ISO string adjusted so the stored value reflects SGT wall-clock time
  const sgOffset = 8 * 60; // SGT is UTC+8
  const utcMs = date.getTime();
  const sgMs = utcMs + sgOffset * 60 * 1000;
  return new Date(sgMs).toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
}

export function isSingaporePast(isoString: string | null | undefined): boolean {
  if (!isoString) return false;
  const now = getSingaporeNow();
  const due = new Date(isoString);
  return due < now;
}

export function getRelativeDueLabel(isoString: string | null | undefined): {
  label: string;
  color: string;
} {
  if (!isoString) return { label: '', color: '' };

  const now = getSingaporeNow();
  const due = new Date(isoString);
  const diffMs = due.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const formatted = formatSingaporeDate(isoString);

  if (diffMs < 0) {
    const absMins = Math.abs(diffMins);
    if (absMins < 60) return { label: `${absMins}m overdue`, color: 'text-red-600' };
    if (absMins < 1440) return { label: `${Math.round(absMins / 60)}h overdue`, color: 'text-red-600' };
    return { label: `${Math.round(absMins / 1440)}d overdue`, color: 'text-red-600' };
  }
  if (diffMins < 60) return { label: `Due in ${diffMins}m`, color: 'text-red-600' };
  if (diffMins < 1440) return { label: `Due in ${Math.round(diffMins / 60)}h (${formatted})`, color: 'text-orange-500' };
  if (diffMins < 10080) return { label: `Due in ${Math.round(diffMins / 1440)}d (${formatted})`, color: 'text-yellow-600' };
  return { label: formatted, color: 'text-blue-600' };
}

export function addDaysToISO(isoString: string, days: number): string {
  const d = new Date(isoString);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 16);
}

export function addMonthsToISO(isoString: string, months: number): string {
  const d = new Date(isoString);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 16);
}

export function addYearsToISO(isoString: string, years: number): string {
  const d = new Date(isoString);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 16);
}

export function getNextRecurrenceDate(
  currentDue: string,
  pattern: 'daily' | 'weekly' | 'monthly' | 'yearly'
): string {
  switch (pattern) {
    case 'daily': return addDaysToISO(currentDue, 1);
    case 'weekly': return addDaysToISO(currentDue, 7);
    case 'monthly': return addMonthsToISO(currentDue, 1);
    case 'yearly': return addYearsToISO(currentDue, 1);
  }
}
