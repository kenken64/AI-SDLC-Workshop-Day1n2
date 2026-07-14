/**
 * GET /api/notifications/check
 *
 * Returns all todos for the authenticated user whose reminder window has opened
 * and that have not yet had a notification sent for the current window.
 *
 * Owner: Person C (Wave 3).
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const now = getSingaporeNow();
  const dueReminders = todoDB.findForNotifications(session.userId, now);

  return NextResponse.json({ success: true, data: dueReminders });
}
