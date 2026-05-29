import { NextResponse } from "next/server";

import { requireSession, unauthorizedResponse } from "@/lib/api";
import { exportImportDB } from "@/lib/db";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const payload = exportImportDB.exportUserData(session.userId);
  return NextResponse.json({
    success: true,
    data: payload,
  });
}
