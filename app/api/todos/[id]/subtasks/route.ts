import { NextRequest, NextResponse } from "next/server";

import {
  badRequestResponse,
  notFoundResponse,
  requireSession,
  unauthorizedResponse,
} from "@/lib/api";
import { subtaskDB, todoDB } from "@/lib/db";
import { createSubtaskSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const todo = todoDB.findById(session.userId, id);
  if (!todo) {
    return notFoundResponse("Todo not found");
  }

  const payload = await request.json();
  const parsed = createSubtaskSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequestResponse(parsed.error.issues[0]?.message || "Invalid subtask payload");
  }

  const subtask = subtaskDB.create(session.userId, id, parsed.data.title);

  return NextResponse.json({
    success: true,
    data: subtask,
  });
}
