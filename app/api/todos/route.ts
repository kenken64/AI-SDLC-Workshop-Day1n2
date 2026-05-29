import { NextRequest, NextResponse } from "next/server";

import { badRequestResponse, requireSession, unauthorizedResponse } from "@/lib/api";
import { tagDB, todoDB } from "@/lib/db";
import { createTodoSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const includeCompleted = request.nextUrl.searchParams.get("includeCompleted") !== "false";
  const month = request.nextUrl.searchParams.get("month") || undefined;

  const todos = todoDB.listByUser(session.userId, {
    includeCompleted,
    month,
  });

  return NextResponse.json({
    success: true,
    data: todos,
    meta: {
      total: todos.length,
      page: 1,
      limit: todos.length,
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const payload = await request.json();
  const parsed = createTodoSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequestResponse(parsed.error.issues[0]?.message || "Invalid payload");
  }

  if (parsed.data.tag_ids && parsed.data.tag_ids.length > 0) {
    for (const tagId of parsed.data.tag_ids) {
      const tag = tagDB.findById(session.userId, tagId);
      if (!tag) {
        return badRequestResponse("One or more tag IDs are invalid");
      }
    }
  }

  const todo = todoDB.create(session.userId, {
    title: parsed.data.title,
    description: parsed.data.description || null,
    due_date: parsed.data.due_date || null,
    priority: parsed.data.priority,
    recurrence_pattern: parsed.data.recurrence_pattern || null,
    reminder_minutes: parsed.data.reminder_minutes || null,
    tag_ids: parsed.data.tag_ids || [],
  });

  return NextResponse.json({
    success: true,
    data: todo,
  });
}
