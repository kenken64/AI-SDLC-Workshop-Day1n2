import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { normalizeSingaporeDateInput, parseSingaporeDateTime, validatePriority } from '@/lib/todo-utils';

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
  }

  const updated = todoDB.update(todoId, session.userId, updates as Partial<Parameters<typeof todoDB.update>[2]>);
  if (!updated) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
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
