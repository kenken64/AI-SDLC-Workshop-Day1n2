import { NextRequest, NextResponse } from 'next/server';
import { todoDB, subtaskDB, tagDB, Priority, RecurrencePattern } from '@/lib/db';
import { getSingaporeNow, getNextRecurrenceDate } from '@/lib/timezone';
import { getSession } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const todoId = parseInt(id, 10);
    if (isNaN(todoId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const existing = todoDB.findById(todoId);
    if (!existing || existing.user_id !== session.userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const { title, priority, due_date, completed, is_recurring, recurrence_pattern, reminder_minutes, tagIds } = body;

    if (title !== undefined && (!title || !title.trim())) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
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

    // Handle completing a recurring todo — create next instance
    const wasCompleted = existing.completed === 0 && completed === true;
    const isRecurring = is_recurring !== undefined ? is_recurring : existing.is_recurring === 1;
    const pattern = (recurrence_pattern ?? existing.recurrence_pattern) as RecurrencePattern | null;

    const updated = todoDB.update(todoId, {
      title: title?.trim(),
      priority: priority as Priority | undefined,
      due_date,
      completed,
      is_recurring,
      recurrence_pattern,
      reminder_minutes,
    });

    // Create next recurring instance when completing
    if (wasCompleted && isRecurring && pattern && existing.due_date) {
      const nextDueDate = getNextRecurrenceDate(existing.due_date, pattern);
      const newTodo = todoDB.create({
        userId: session.userId,
        title: existing.title,
        priority: (priority as Priority | undefined) ?? existing.priority,
        due_date: nextDueDate,
        is_recurring: true,
        recurrence_pattern: pattern,
        reminder_minutes: existing.reminder_minutes ?? null,
      });
      // Copy tags from original todo
      const existingTagIds = tagDB.getTagsForTodo(todoId).map(t => t.id);
      if (existingTagIds.length > 0) tagDB.setTodoTags(newTodo.id, existingTagIds);
    }

    // Update tags if provided
    if (Array.isArray(tagIds)) {
      tagDB.setTodoTags(todoId, tagIds.filter((id: unknown) => typeof id === 'number'));
    }

    const subtasks = subtaskDB.findByTodoId(todoId);
    const tags = tagDB.getTagsForTodo(todoId);
    return NextResponse.json({ ...updated, subtasks, tags });
  } catch (error) {
    console.error('PUT /api/todos/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const todoId = parseInt(id, 10);
    if (isNaN(todoId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const existing = todoDB.findById(todoId);
    if (!existing || existing.user_id !== session.userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    todoDB.delete(todoId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/todos/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
