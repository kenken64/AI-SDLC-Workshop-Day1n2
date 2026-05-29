import { describe, expect, test } from "vitest";

import { createTodoSchema } from "@/lib/validation";

describe("validation", () => {
  test("accepts valid todo payload", () => {
    const parsed = createTodoSchema.safeParse({
      title: "Task",
      due_date: new Date(Date.now() + 120_000).toISOString(),
      priority: "high",
      recurrence_pattern: "daily",
      reminder_minutes: 15,
    });

    expect(parsed.success).toBe(true);
  });

  test("rejects blank title", () => {
    const parsed = createTodoSchema.safeParse({
      title: "   ",
    });

    expect(parsed.success).toBe(false);
  });
});
