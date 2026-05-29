import { z } from "zod";

const exportedTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
});

const exportedTodoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  due_date: z.string().nullable(),
  completed: z.boolean(),
  priority: z.enum(["high", "medium", "low"]),
  recurrence_pattern: z.enum(["daily", "weekly", "monthly", "yearly"]).nullable(),
  reminder_minutes: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const exportedSubtaskSchema = z.object({
  id: z.string(),
  todo_id: z.string(),
  title: z.string(),
  completed: z.boolean(),
  position: z.number(),
});

const exportedTodoTagSchema = z.object({
  todo_id: z.string(),
  tag_id: z.string(),
});

export const importPayloadSchema = z.object({
  version: z.literal("1.0"),
  todos: z.array(exportedTodoSchema),
  subtasks: z.array(exportedSubtaskSchema),
  tags: z.array(exportedTagSchema),
  todo_tags: z.array(exportedTodoTagSchema),
});

export type ImportPayload = z.infer<typeof importPayloadSchema>;

export interface IdMap {
  todos: Map<string, string>;
  tags: Map<string, string>;
}

export function createIdMap(): IdMap {
  return {
    todos: new Map<string, string>(),
    tags: new Map<string, string>(),
  };
}
