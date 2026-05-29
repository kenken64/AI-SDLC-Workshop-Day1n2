import { NextRequest, NextResponse } from "next/server";

import { requireSession, unauthorizedResponse } from "@/lib/api";
import { todoDB } from "@/lib/db";

export async function POST(_request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const notifications = todoDB.listDueNotifications(session.userId);
  todoDB.markNotificationSent(notifications.map((item) => item.id));

  return NextResponse.json({
    success: true,
    notifications,
  });
}
