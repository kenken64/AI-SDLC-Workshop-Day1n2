import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, tagDB } from '@/lib/db';
import { normalizeSingaporeDateInput, parseSingaporeDateTime, validatePriority } from '@/lib/todo-utils';
import { calculateNextDueDate } from '@/lib/recurrence';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const todoId = Number(id);
  const existing = todoDB.findById(todoId, session.userId);
  if (!existing) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    }
    updates.title = body.title.trim();
  }

  if (body.completed !== undefined) {
    if (typeof body.completed !== 'boolean') {
      return NextResponse.json({ error: 'completed must be a boolean' }, { status: 400 });
    }
    updates.completed = body.completed;
  }

  if (body.due_date !== undefined) {
    try {
      updates.due_date = normalizeSingaporeDateInput(body.due_date);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid due date' }, { status: 400 });
    }

    if (typeof updates.due_date === 'string') {
      const due = parseSingaporeDateTime(updates.due_date).getTime();
      const minDue = Date.now() + 60_000;
      if (due < minDue) {
        return NextResponse.json({ error: 'Due date must be at least 1 minute in the future' }, { status: 400 });
      }
    }
  }

  if (body.priority !== undefined) {
    if (body.priority === null) {
      return NextResponse.json({ error: "Invalid priority: null. Must be 'high', 'medium', or 'low'." }, { status: 400 });
    }

    try {
      updates.priority = validatePriority(body.priority);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid priority' }, { status: 400 });
    }
  }

  if (body.is_recurring !== undefined) {
    if (typeof body.is_recurring !== 'boolean') {
      return NextResponse.json({ error: 'is_recurring must be a boolean' }, { status: 400 });
    }
    updates.is_recurring = body.is_recurring;
  }

  if (body.recurrence_pattern !== undefined) {
    if (
      body.recurrence_pattern !== null &&
      body.recurrence_pattern !== 'daily' &&
      body.recurrence_pattern !== 'weekly' &&
      body.recurrence_pattern !== 'monthly' &&
      body.recurrence_pattern !== 'yearly'
    ) {
      return NextResponse.json({ error: 'Invalid recurrence pattern' }, { status: 400 });
    }
    updates.recurrence_pattern = body.recurrence_pattern;
  }

  if (body.reminder_minutes !== undefined) {
    if (body.reminder_minutes !== null && typeof body.reminder_minutes !== 'number') {
      return NextResponse.json({ error: 'reminder_minutes must be a number' }, { status: 400 });
    }
    updates.reminder_minutes = body.reminder_minutes;
    // Changing the reminder offset re-arms the notification for the new window.
    updates.last_notification_sent = null;
  }

  if (body.last_notification_sent !== undefined) {
    if (body.last_notification_sent !== null && typeof body.last_notification_sent !== 'string') {
      return NextResponse.json({ error: 'last_notification_sent must be a string or null' }, { status: 400 });
    }
    // Only overwrite if not already being reset by due_date/reminder_minutes change above.
    if (updates.last_notification_sent === undefined) {
      updates.last_notification_sent = body.last_notification_sent;
    }
  }

  // Reset last_notification_sent when the due date changes so the reminder fires fresh.
  if (body.due_date !== undefined && updates.last_notification_sent === undefined) {
    updates.last_notification_sent = null;
  }

  const updated = todoDB.update(todoId, session.userId, updates as Partial<Parameters<typeof todoDB.update>[2]>);
  if (!updated) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  // ── Recurring completion: spawn next instance ────────────────────────────
  // Only trigger when this request transitions completed false → true on a
  // recurring todo.  Guard against double-submit by checking existing.completed.
  const justCompleted =
    body.completed === true &&
    existing.completed === false &&
    existing.is_recurring &&
    existing.recurrence_pattern &&
    existing.due_date;

  if (justCompleted && existing.recurrence_pattern && existing.due_date) {
    const nextDueDate = calculateNextDueDate(existing.due_date, existing.recurrence_pattern);

    const nextInstance = todoDB.create({
      user_id: session.userId,
      title: existing.title,
      priority: existing.priority,
      is_recurring: true,
      recurrence_pattern: existing.recurrence_pattern,
      reminder_minutes: existing.reminder_minutes ?? null,
      due_date: nextDueDate,
    });

    // Copy all tag associations from the completed instance.
    const tags = tagDB.findByTodoId(existing.id);
    for (const tag of tags) {
      tagDB.attachToTodo(nextInstance.id, tag.id);
    }

    return NextResponse.json({ todo: updated, nextInstance });
  }

  return NextResponse.json({ todo: updated });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const todoId = Number(id);
  const existing = todoDB.findById(todoId, session.userId);
  if (!existing) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  todoDB.delete(todoId, session.userId);
  return NextResponse.json({ success: true });
}
