import { z } from "zod";

import { isAtLeastOneMinuteInFuture } from "@/lib/timezone";

export const prioritySchema = z.enum(["high", "medium", "low"]);
export const recurrenceSchema = z.enum(["daily", "weekly", "monthly", "yearly"]);

export const reminderOptionSchema = z.enum([
  "none",
  "15m",
  "30m",
  "1h",
  "2h",
  "1d",
  "2d",
  "1w",
]);

export const reminderOptionToMinutes: Record<z.infer<typeof reminderOptionSchema>, number | null> = {
  none: null,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  "1d": 1440,
  "2d": 2880,
  "1w": 10080,
};

export const reminderMinutesToOption = (minutes: number | null): z.infer<typeof reminderOptionSchema> => {
  const entry = Object.entries(reminderOptionToMinutes).find(([, value]) => value === minutes);
  return (entry?.[0] as z.infer<typeof reminderOptionSchema> | undefined) ?? "none";
};

const isoDateSchema = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date format")
  .refine((value) => isAtLeastOneMinuteInFuture(value), "Due date must be at least 1 minute in future");

const todoBaseSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional().nullable(),
  due_date: isoDateSchema.optional().nullable(),
  priority: prioritySchema.default("medium"),
  recurrence_pattern: recurrenceSchema.optional().nullable(),
  reminder_minutes: z.number().int().positive().optional().nullable(),
  tag_ids: z.array(z.string()).optional(),
});

export const createTodoSchema = todoBaseSchema.refine(
    (value) => {
      if (!value.recurrence_pattern) {
        return true;
      }
      return Boolean(value.due_date);
    },
    {
      message: "Recurring todos require a due date",
      path: ["due_date"],
    },
  );

export const updateTodoSchema = todoBaseSchema.partial().extend({
  completed: z.boolean().optional(),
});

export const createSubtaskSchema = z.object({
  title: z.string().trim().min(1).max(300),
});

export const updateSubtaskSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  completed: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z
    .string()
    .regex(/^#([0-9A-Fa-f]{6})$/, "Color must be a valid hex code")
    .default("#3B82F6"),
});

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().max(80).optional().nullable(),
  title: z.string().trim().min(1).max(200),
  priority: prioritySchema.default("medium"),
  recurrence_pattern: recurrenceSchema.optional().nullable(),
  reminder_minutes: z.number().int().positive().optional().nullable(),
  due_date_offset_minutes: z.number().int().optional().nullable(),
  subtasks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        position: z.number().int().min(0),
      }),
    )
    .default([]),
});
