import { NextRequest, NextResponse } from "next/server";

import {
  badRequestResponse,
  notFoundResponse,
  requireSession,
  unauthorizedResponse,
} from "@/lib/api";
import { subtaskDB } from "@/lib/db";
import { updateSubtaskSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const payload = await request.json();
  const parsed = updateSubtaskSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequestResponse(parsed.error.issues[0]?.message || "Invalid subtask payload");
  }

  const subtask = subtaskDB.update(session.userId, id, parsed.data);
  if (!subtask) {
    return notFoundResponse("Subtask not found");
  }

  return NextResponse.json({
    success: true,
    data: subtask,
  });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const deleted = subtaskDB.delete(session.userId, id);
  if (!deleted) {
    return notFoundResponse("Subtask not found");
  }

  return NextResponse.json({
    success: true,
  });
}
