const SINGAPORE_TIMEZONE = "Asia/Singapore";

export type RecurrencePattern = "daily" | "weekly" | "monthly" | "yearly";

const dateTimeFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: SINGAPORE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function getSingaporeNow(): Date {
  // Converts current instant into a Date interpreted in Singapore local clock time.
  const raw = new Date();
  const parts = dateTimeFormat.formatToParts(raw);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const ms = String(raw.getMilliseconds()).padStart(3, "0");

  return new Date(
    `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}.${ms}+08:00`,
  );
}

export function toSingaporeIso(date: Date): string {
  return new Date(date.getTime()).toISOString();
}

export function isValidDateInput(dateText: string): boolean {
  if (!dateText) {
    return false;
  }

  const parsed = new Date(dateText);
  return !Number.isNaN(parsed.getTime());
}

export function calculateNextDueDate(
  dueDateIso: string,
  pattern: RecurrencePattern,
): string {
  const current = new Date(dueDateIso);
  const next = new Date(current.getTime());

  if (pattern === "daily") {
    next.setUTCDate(next.getUTCDate() + 1);
  } else if (pattern === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
  } else if (pattern === "monthly") {
    next.setUTCMonth(next.getUTCMonth() + 1);
  } else {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  }

  return next.toISOString();
}
