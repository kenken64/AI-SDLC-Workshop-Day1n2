export const SINGAPORE_TIMEZONE = "Asia/Singapore";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  hour12: false,
  timeZone: SINGAPORE_TIMEZONE,
});

export function getSingaporeNow(): Date {
  return new Date();
}

export function formatSingaporeDate(date: Date | string | null | undefined): string {
  if (!date) {
    return "No due date";
  }

  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) {
    return "Invalid date";
  }

  return DATE_TIME_FORMATTER.format(value);
}

export function getSingaporeDateKey(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SINGAPORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function getMonthKeySingapore(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SINGAPORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function isAtLeastOneMinuteInFuture(date: Date | string): boolean {
  const value = typeof date === "string" ? new Date(date) : date;
  return value.getTime() >= addMinutes(getSingaporeNow(), 1).getTime();
}
