import { describe, expect, test } from "vitest";

import { nextRecurringDueDate } from "@/lib/recurrence";

describe("recurrence", () => {
  test("daily increments by one day", () => {
    const value = nextRecurringDueDate("2026-01-01T00:00:00.000Z", "daily");
    expect(value.startsWith("2026-01-02")).toBe(true);
  });

  test("weekly increments by seven days", () => {
    const value = nextRecurringDueDate("2026-01-01T00:00:00.000Z", "weekly");
    expect(value.startsWith("2026-01-08")).toBe(true);
  });
});
