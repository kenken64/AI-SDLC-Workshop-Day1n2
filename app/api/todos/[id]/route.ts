import { NextRequest, NextResponse } from "next/server";

import {
  badRequestResponse,
  notFoundResponse,
  requireSession,
  unauthorizedResponse,
} from "@/lib/api";
import { tagDB, todoDB } from "@/lib/db";
import { updateTodoSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const todo = todoDB.findById(session.userId, id);
  if (!todo) {
    return notFoundResponse("Todo not found");
  }

  return NextResponse.json({
    success: true,
    data: todo,
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const payload = await request.json();
  const parsed = updateTodoSchema.safeParse(payload);

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

  const updated = todoDB.update(session.userId, id, {
    ...parsed.data,
    tag_ids: parsed.data.tag_ids,
  });

  if (!updated) {
    return notFoundResponse("Todo not found");
  }

  return NextResponse.json({
    success: true,
    data: updated,
  });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const deleted = todoDB.delete(session.userId, id);
  if (!deleted) {
    return notFoundResponse("Todo not found");
  }

  return NextResponse.json({
    success: true,
  });
}
