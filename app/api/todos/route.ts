import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, Priority, RecurrencePattern } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const todos = todoDB.findByUserId(session.userId);
  return NextResponse.json(todos);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const body = await request.json();
    const { title, priority, due_date, is_recurring, recurrence_pattern } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    if (priority && !['high', 'medium', 'low'].includes(priority)) {
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
    }

    if (due_date) {
      const dueDate = new Date(due_date);
      const now = getSingaporeNow();
      if (dueDate <= now) {
        return NextResponse.json({ error: 'Due date must be in the future' }, { status: 400 });
      }
    }

    if (is_recurring && !due_date) {
      return NextResponse.json({ error: 'Recurring todos require a due date' }, { status: 400 });
    }

    if (is_recurring && recurrence_pattern && !['daily', 'weekly', 'monthly', 'yearly'].includes(recurrence_pattern)) {
      return NextResponse.json({ error: 'Invalid recurrence pattern' }, { status: 400 });
    }

    const todo = todoDB.create({
      userId: session.userId,
      title: title.trim(),
      priority: (priority as Priority) ?? 'medium',
      due_date: due_date ?? null,
      is_recurring: !!is_recurring,
      recurrence_pattern: is_recurring ? ((recurrence_pattern as RecurrencePattern) ?? 'weekly') : null,
    });

    return NextResponse.json(todo, { status: 201 });
  } catch (error) {
    console.error('POST /api/todos error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
