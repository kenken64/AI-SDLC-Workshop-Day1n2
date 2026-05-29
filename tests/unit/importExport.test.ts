import { describe, expect, test } from "vitest";

import { importPayloadSchema } from "@/lib/importExport";

describe("import schema", () => {
  test("accepts valid payload", () => {
    const parsed = importPayloadSchema.safeParse({
      version: "1.0",
      todos: [],
      subtasks: [],
      tags: [],
      todo_tags: [],
    });

    expect(parsed.success).toBe(true);
  });
});
