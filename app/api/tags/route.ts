import { NextRequest, NextResponse } from "next/server";

import { badRequestResponse, requireSession, unauthorizedResponse } from "@/lib/api";
import { tagDB } from "@/lib/db";
import { createTagSchema } from "@/lib/validation";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const tags = tagDB.listByUser(session.userId);
  return NextResponse.json({
    success: true,
    data: tags,
  });
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const payload = await request.json();
  const parsed = createTagSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequestResponse(parsed.error.issues[0]?.message || "Invalid tag payload");
  }

  const existing = tagDB.findByName(session.userId, parsed.data.name);
  if (existing) {
    return badRequestResponse("Tag name must be unique per user");
  }

  const tag = tagDB.create(session.userId, parsed.data.name, parsed.data.color);
  return NextResponse.json({
    success: true,
    data: tag,
  });
}
