import { NextRequest, NextResponse } from "next/server";
import { todoDB } from "@/lib/db";
import { toSingaporeIso, getSingaporeNow } from "@/lib/timezone";

const VALID_PRIORITIES = ["high", "medium", "low"] as const;
const VALID_PATTERNS = ["daily", "weekly", "monthly", "yearly"] as const;

type ImportTodo = {
  id?: number;
  title?: string;
  description?: string | null;
  priority?: string;
  recurrence_pattern?: string | null;
  due_date?: string | null;
  completed?: number | boolean;
  reminder_minutes?: number | null;
};

type ImportBody = {
  todos?: unknown[];
  tags?: unknown[];
  subtasks?: unknown[];
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ImportBody;

    if (!body || typeof body !== "object" || !Array.isArray(body.todos)) {
      return NextResponse.json(
        { error: "Invalid import format. Expected { todos: [...] }" },
        { status: 400 },
      );
    }

    const { todos } = body;

    // Strict validation pass — reject entire import on any invalid todo
    for (const item of todos) {
      const todo = item as ImportTodo;

      if (!todo.title || typeof todo.title !== "string" || !todo.title.trim()) {
        return NextResponse.json(
          { error: "All todos must have a non-empty title" },
          { status: 400 },
        );
      }

      if (
        todo.priority !== undefined &&
        todo.priority !== null &&
        !(VALID_PRIORITIES as readonly string[]).includes(todo.priority)
      ) {
        return NextResponse.json(
          { error: `Invalid priority: ${todo.priority}` },
          { status: 400 },
        );
      }

      if (
        todo.recurrence_pattern !== undefined &&
        todo.recurrence_pattern !== null &&
        !(VALID_PATTERNS as readonly string[]).includes(todo.recurrence_pattern)
      ) {
        return NextResponse.json(
          { error: `Invalid recurrence_pattern: ${todo.recurrence_pattern}` },
          { status: 400 },
        );
      }
    }

    const nowIso = toSingaporeIso(getSingaporeNow());

    for (const item of todos) {
      const todo = item as ImportTodo;
      const priority = (todo.priority as "high" | "medium" | "low") ?? "medium";
      const recurrencePattern =
        (todo.recurrence_pattern as "daily" | "weekly" | "monthly" | "yearly" | null) ?? null;
      const completed =
        typeof todo.completed === "boolean"
          ? todo.completed ? 1 : 0
          : typeof todo.completed === "number"
            ? todo.completed
            : 0;

      const created = todoDB.create(
        {
          title: todo.title!.trim(),
          description:
            todo.description && typeof todo.description === "string"
              ? todo.description.trim() || null
              : null,
          priority,
          recurrence_pattern: recurrencePattern,
          due_date:
            todo.due_date && typeof todo.due_date === "string"
              ? todo.due_date
              : null,
          reminder_minutes: typeof todo.reminder_minutes === "number" ? todo.reminder_minutes : null,
        },
        nowIso,
      );

      // Mark as completed after creation if needed
      if (completed) {
        todoDB.update(created.id, { completed: true }, nowIso);
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to import todos." },
      { status: 500 },
    );
  }
}
