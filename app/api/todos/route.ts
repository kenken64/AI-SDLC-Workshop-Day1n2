import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { normalizeSingaporeDateInput, parseSingaporeDateTime, validatePriority } from '@/lib/todo-utils';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return NextResponse.json(todoDB.findByUserId(session.userId));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  let dueDate: string | null = null;
  try {
    dueDate = normalizeSingaporeDateInput(body.due_date);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid due date' }, { status: 400 });
  }

  if (dueDate) {
    const due = parseSingaporeDateTime(dueDate).getTime();
    const minDue = Date.now() + 60_000;
    if (due < minDue) {
      return NextResponse.json({ error: 'Due date must be at least 1 minute in the future' }, { status: 400 });
    }
  }

  let priority;
  try {
    priority = validatePriority(body.priority);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid priority' }, { status: 400 });
  }

  const isRecurring = typeof body.is_recurring === 'boolean' ? body.is_recurring : false;
  const recurrencePattern =
    body.recurrence_pattern === 'daily' ||
    body.recurrence_pattern === 'weekly' ||
    body.recurrence_pattern === 'monthly' ||
    body.recurrence_pattern === 'yearly'
      ? body.recurrence_pattern
      : null;

  if (isRecurring && !dueDate) {
    return NextResponse.json(
      { error: 'Recurring todos require a due date' },
      { status: 400 },
    );
  }
  if (isRecurring && !recurrencePattern) {
    return NextResponse.json({ error: 'Invalid recurrence pattern' }, { status: 400 });
  }

  const todo = todoDB.create({
    user_id: session.userId,
    title,
    due_date: dueDate,
    priority,
    is_recurring: isRecurring,
    recurrence_pattern: recurrencePattern,
    reminder_minutes:
      typeof body.reminder_minutes === 'number' ? body.reminder_minutes : null,
  });

  return NextResponse.json(todo, { status: 201 });
}
