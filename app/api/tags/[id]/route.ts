import { NextRequest, NextResponse } from "next/server";

import {
  badRequestResponse,
  notFoundResponse,
  requireSession,
  unauthorizedResponse,
} from "@/lib/api";
import { tagDB } from "@/lib/db";
import { createTagSchema } from "@/lib/validation";

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
  const parsed = createTagSchema.partial().safeParse(payload);
  if (!parsed.success) {
    return badRequestResponse(parsed.error.issues[0]?.message || "Invalid tag payload");
  }

  if (parsed.data.name) {
    const duplicate = tagDB.findByName(session.userId, parsed.data.name);
    if (duplicate && duplicate.id !== id) {
      return badRequestResponse("Tag name must be unique per user");
    }
  }

  const tag = tagDB.update(session.userId, id, parsed.data);
  if (!tag) {
    return notFoundResponse("Tag not found");
  }

  return NextResponse.json({
    success: true,
    data: tag,
  });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const deleted = tagDB.delete(session.userId, id);
  if (!deleted) {
    return notFoundResponse("Tag not found");
  }

  return NextResponse.json({
    success: true,
  });
}
