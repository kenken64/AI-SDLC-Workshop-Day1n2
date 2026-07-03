import { NextResponse } from 'next/server';
import { todoDB, SYSTEM_USER_ID } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const now = getSingaporeNow();
  const dueReminders = todoDB.findDueReminders(session.userId, now);

  for (const todo of dueReminders) {
    todoDB.markNotificationSent(todo.id, now.toISOString());
  }

  return NextResponse.json(
    dueReminders.map(t => ({ id: t.id, title: t.title, due_date: t.due_date }))
  );
}
