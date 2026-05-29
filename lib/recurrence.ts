import { getSingaporeNow } from "@/lib/timezone";

export type RecurrencePattern = "daily" | "weekly" | "monthly" | "yearly";

export function nextRecurringDueDate(
  currentDueDate: string,
  recurrencePattern: RecurrencePattern,
): string {
  const current = new Date(currentDueDate);
  if (Number.isNaN(current.getTime())) {
    throw new Error("Invalid due date for recurrence");
  }

  const nextDate = new Date(current);

  if (recurrencePattern === "daily") {
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  }

  if (recurrencePattern === "weekly") {
    nextDate.setUTCDate(nextDate.getUTCDate() + 7);
  }

  if (recurrencePattern === "monthly") {
    nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
  }

  if (recurrencePattern === "yearly") {
    nextDate.setUTCFullYear(nextDate.getUTCFullYear() + 1);
  }

  return nextDate.toISOString();
}

export function isRecurringPattern(value: string | null | undefined): value is RecurrencePattern {
  return value === "daily" || value === "weekly" || value === "monthly" || value === "yearly";
}

export function isDueInPast(dateIso: string): boolean {
  return new Date(dateIso).getTime() < getSingaporeNow().getTime();
}
