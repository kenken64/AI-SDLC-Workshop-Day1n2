import { NextRequest, NextResponse } from "next/server";

import {
  badRequestResponse,
  notFoundResponse,
  requireSession,
  unauthorizedResponse,
} from "@/lib/api";
import { templateDB } from "@/lib/db";
import { createTemplateSchema } from "@/lib/validation";

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
  const parsed = createTemplateSchema.partial().safeParse(payload);
  if (!parsed.success) {
    return badRequestResponse(parsed.error.issues[0]?.message || "Invalid template payload");
  }

  const patch = {
    ...parsed.data,
    subtasks_json: parsed.data.subtasks ? JSON.stringify(parsed.data.subtasks) : undefined,
  };

  const updated = templateDB.update(session.userId, id, patch);
  if (!updated) {
    return notFoundResponse("Template not found");
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
  const deleted = templateDB.delete(session.userId, id);
  if (!deleted) {
    return notFoundResponse("Template not found");
  }

  return NextResponse.json({
    success: true,
  });
}
