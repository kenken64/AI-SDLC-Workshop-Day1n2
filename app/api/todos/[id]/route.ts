import { NextRequest, NextResponse } from "next/server";
import { todoDB, REMINDER_OPTIONS } from "@/lib/db";
import {
  getSingaporeNow,
  isValidDateInput,
  toSingaporeIso,
} from "@/lib/timezone";

type UpdateTodoRequest = {
  title?: string;
  description?: string | null;
  priority?: "high" | "medium" | "low";
  recurrence_pattern?: "daily" | "weekly" | "monthly" | "yearly" | null;
  due_date?: string | null;
  completed?: boolean;
  reminder_minutes?: number | null;
};

function validateUpdatePayload(body: UpdateTodoRequest): string | null {
  if (body.title !== undefined) {
    const trimmed = body.title.trim();
    if (!trimmed) {
      return "Title cannot be empty.";
    }
    if (trimmed.length > 120) {
      return "Title must be 120 characters or less.";
    }
  }

  if (body.description !== undefined && body.description !== null) {
    if (body.description.length > 500) {
      return "Description must be 500 characters or less.";
    }
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

  if (body.due_date !== undefined && body.due_date !== null) {
    if (!isValidDateInput(body.due_date)) {
      return "Due date must be a valid ISO datetime string.";
    }
  }

  if (body.completed !== undefined && typeof body.completed !== "boolean") {
    return "Completed must be a boolean.";
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

function parseId(rawId: string): number | null {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;
    const id = parseId(rawId);

    if (!id) {
      return NextResponse.json({ error: "Invalid todo id." }, { status: 400 });
    }

    const body = (await request.json()) as UpdateTodoRequest;
    const validationError = validateUpdatePayload(body);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const nowIso = toSingaporeIso(getSingaporeNow());

    if (body.completed === true) {
      const existing = todoDB.getById(id);

      if (!existing) {
        return NextResponse.json({ error: "Todo not found." }, { status: 404 });
      }

      if (existing.recurrence_pattern && existing.completed === 0) {
        const result = todoDB.completeRecurring(id, nowIso);

        if (!result) {
          return NextResponse.json(
            { error: "Failed to complete recurring todo." },
            { status: 500 },
          );
        }

        return NextResponse.json(
          { data: result.current, next_todo: result.next },
          { status: 200 },
        );
      }
    }

    const todo = todoDB.update(
      id,
      {
        title: body.title?.trim(),
        description:
          body.description === undefined ? undefined : body.description,
        priority: body.priority,
        recurrence_pattern:
          body.recurrence_pattern === undefined
            ? undefined
            : body.recurrence_pattern,
        due_date: body.due_date === undefined ? undefined : body.due_date,
        completed: body.completed,
        reminder_minutes:
          body.reminder_minutes === undefined
            ? undefined
            : body.reminder_minutes,
      },
      nowIso,
    );

    if (!todo) {
      return NextResponse.json({ error: "Todo not found." }, { status: 404 });
    }

    return NextResponse.json({ data: todo }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to update todo." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;
    const id = parseId(rawId);

    if (!id) {
      return NextResponse.json({ error: "Invalid todo id." }, { status: 400 });
    }

    const deleted = todoDB.delete(id);

    if (!deleted) {
      return NextResponse.json({ error: "Todo not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete todo." },
      { status: 500 },
    );
  }
}
