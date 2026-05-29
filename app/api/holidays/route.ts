import { NextRequest, NextResponse } from "next/server";

import { badRequestResponse, requireSession, unauthorizedResponse } from "@/lib/api";
import { holidayDB } from "@/lib/db";
import { getMonthKeySingapore } from "@/lib/timezone";

export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const month = request.nextUrl.searchParams.get("month") || getMonthKeySingapore(new Date());
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return badRequestResponse("month must use YYYY-MM format");
  }

  const holidays = holidayDB.listByMonth(month);
  return NextResponse.json({
    success: true,
    data: holidays,
  });
}
