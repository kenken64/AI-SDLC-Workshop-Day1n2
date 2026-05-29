import { NextRequest, NextResponse } from "next/server";

import { notFoundResponse, requireSession, unauthorizedResponse } from "@/lib/api";
import { templateDB } from "@/lib/db";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;

  try {
    const todo = templateDB.useTemplate(session.userId, id);
    return NextResponse.json({
      success: true,
      data: todo,
    });
  } catch {
    return notFoundResponse("Template not found");
  }
}
