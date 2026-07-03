import { NextResponse } from 'next/server';
import { todoDB, SYSTEM_USER_ID } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

export async function GET() {
  const now = getSingaporeNow();
  const dueReminders = todoDB.findDueReminders(SYSTEM_USER_ID, now);

  for (const todo of dueReminders) {
    todoDB.markNotificationSent(todo.id, now.toISOString());
  }

  return NextResponse.json(
    dueReminders.map(t => ({ id: t.id, title: t.title, due_date: t.due_date }))
  );
}
