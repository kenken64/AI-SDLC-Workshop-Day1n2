import { describe, expect, test } from "vitest";

import { getTodoProgress } from "@/lib/db";

describe("progress", () => {
  test("calculates percentage", () => {
    const value = getTodoProgress({
      id: "1",
      user_id: "u",
      title: "t",
      description: null,
      due_date: null,
      completed: false,
      priority: "medium",
      recurrence_pattern: null,
      reminder_minutes: null,
      last_notification_sent: null,
      created_at: "",
      updated_at: "",
      tags: [],
      subtasks: [
        { id: "s1", todo_id: "1", title: "a", completed: true, position: 0, created_at: "" },
        { id: "s2", todo_id: "1", title: "b", completed: false, position: 1, created_at: "" },
      ],
    });

    expect(value.total).toBe(2);
    expect(value.completed).toBe(1);
    expect(value.percentage).toBe(50);
  });
});
