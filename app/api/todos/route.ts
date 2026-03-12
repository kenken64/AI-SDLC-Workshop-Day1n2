import { NextRequest, NextResponse } from "next/server";
import { todoDB, REMINDER_OPTIONS } from "@/lib/db";
import {
  getSingaporeNow,
  isValidDateInput,
  toSingaporeIso,
} from "@/lib/timezone";

type CreateTodoRequest = {
  title?: string;
  description?: string;
  priority?: "high" | "medium" | "low";
  recurrence_pattern?: "daily" | "weekly" | "monthly" | "yearly" | null;
  due_date?: string | null;
  reminder_minutes?: number | null;
};

function validateCreatePayload(body: CreateTodoRequest): string | null {
  const title = body.title?.trim();

  if (!title) {
    return "Title is required.";
  }

  if (title.length > 120) {
    return "Title must be 120 characters or less.";
  }

  if (body.description && body.description.length > 500) {
    return "Description must be 500 characters or less.";
  }

  if (
    body.priority !== undefined &&
    !["high", "medium", "low"].includes(body.priority)
  ) {
    return "Priority must be high, medium, or low.";
  }

  if (
    body.recurrence_pattern !== undefined &&
    body.recurrence_pattern !== null &&
    !["daily", "weekly", "monthly", "yearly"].includes(body.recurrence_pattern)
  ) {
    return "Recurrence pattern must be daily, weekly, monthly, yearly, or null.";
  }

  if (body.due_date && !isValidDateInput(body.due_date)) {
    return "Due date must be a valid ISO datetime string.";
  }

  if (
    body.reminder_minutes !== undefined &&
    body.reminder_minutes !== null &&
    !(REMINDER_OPTIONS as readonly number[]).includes(body.reminder_minutes)
  ) {
    return "Reminder must be 15, 30, 60, 120, 1440, 2880, or 10080 minutes.";
  }

  return null;
}

export async function GET() {
  try {
    const todos = todoDB.list();
    return NextResponse.json({ data: todos }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to load todos." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateTodoRequest;
    const validationError = validateCreatePayload(body);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const nowIso = toSingaporeIso(getSingaporeNow());
    const todo = todoDB.create(
      {
        title: body.title!.trim(),
        description: body.description?.trim() || null,
        priority: body.priority ?? "medium",
        recurrence_pattern: body.recurrence_pattern ?? null,
        due_date: body.due_date || null,
        reminder_minutes: body.reminder_minutes ?? null,
      },
      nowIso,
    );

    return NextResponse.json({ data: todo }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create todo." },
      { status: 500 },
    );
  }
}
