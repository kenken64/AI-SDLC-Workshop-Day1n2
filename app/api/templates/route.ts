import { NextRequest, NextResponse } from "next/server";

import { badRequestResponse, requireSession, unauthorizedResponse } from "@/lib/api";
import { templateDB } from "@/lib/db";
import { createTemplateSchema } from "@/lib/validation";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const templates = templateDB.listByUser(session.userId);
  return NextResponse.json({
    success: true,
    data: templates,
  });
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const payload = await request.json();
  const parsed = createTemplateSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequestResponse(parsed.error.issues[0]?.message || "Invalid template payload");
  }

  const template = templateDB.create(session.userId, {
    ...parsed.data,
    subtasks_json: JSON.stringify(parsed.data.subtasks),
  });

  return NextResponse.json({
    success: true,
    data: template,
  });
}
