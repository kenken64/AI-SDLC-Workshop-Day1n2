import { NextRequest, NextResponse } from "next/server";

import { badRequestResponse, requireSession, unauthorizedResponse } from "@/lib/api";
import { todoDB } from "@/lib/db";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const payload = (await request.json()) as { tagId?: string };

  if (!payload.tagId) {
    return badRequestResponse("tagId is required");
  }

  try {
    todoDB.addTag(session.userId, id, payload.tagId);
    return NextResponse.json({
      success: true,
    });
  } catch {
    return badRequestResponse("Unable to add tag");
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const tagId = request.nextUrl.searchParams.get("tagId");
  if (!tagId) {
    return badRequestResponse("tagId query parameter is required");
  }

  try {
    todoDB.removeTag(session.userId, id, tagId);
    return NextResponse.json({
      success: true,
    });
  } catch {
    return badRequestResponse("Unable to remove tag");
  }
}
