import { NextRequest, NextResponse } from "next/server";

import { badRequestResponse, requireSession, unauthorizedResponse } from "@/lib/api";
import { exportImportDB } from "@/lib/db";
import { importPayloadSchema } from "@/lib/importExport";

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const payload = await request.json();
  const parsed = importPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequestResponse(parsed.error.issues[0]?.message || "Invalid import payload");
  }

  const result = exportImportDB.importUserData(session.userId, parsed.data);
  return NextResponse.json({
    success: true,
    data: result,
  });
}
