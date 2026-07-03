import { NextRequest, NextResponse } from 'next/server';
import { todoDB, subtaskDB, tagDB, Tag, Priority, RecurrencePattern } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

const VALID_REMINDER_MINUTES = [15, 30, 60, 120, 1440, 2880, 10080];

export async function GET() {
  const todos = todoDB.findAll();
  const subtasks = subtaskDB.findAll();
  const tagMappings = tagDB.findWithTodoIds();

  const todoTagsMap: Record<number, Tag[]> = {};
  for (const row of tagMappings) {
    const { todo_id, ...tag } = row;
    if (!todoTagsMap[todo_id]) todoTagsMap[todo_id] = [];
    todoTagsMap[todo_id].push(tag as Tag);
  }

  return NextResponse.json(
    todos.map(todo => ({
      ...todo,
      subtasks: subtasks.filter(s => s.todo_id === todo.id),
      tags: todoTagsMap[todo.id] ?? [],
    }))
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, priority, due_date, is_recurring, recurrence_pattern, reminder_minutes, tagIds } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    if (title.trim().length > 500) {
      return NextResponse.json({ error: 'Title must be 500 characters or fewer' }, { status: 400 });
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

    if (reminder_minutes !== null && reminder_minutes !== undefined && !VALID_REMINDER_MINUTES.includes(reminder_minutes)) {
      return NextResponse.json({ error: 'Invalid reminder value' }, { status: 400 });
    }

    const todo = todoDB.create({
      title: title.trim(),
      priority: (priority as Priority) ?? 'medium',
      due_date: due_date ?? null,
      is_recurring: !!is_recurring,
      recurrence_pattern: is_recurring ? ((recurrence_pattern as RecurrencePattern) ?? 'weekly') : null,
      reminder_minutes: reminder_minutes ?? null,
    });

    if (Array.isArray(tagIds) && tagIds.length > 0) {
      tagDB.setTodoTags(todo.id, tagIds.filter((id: unknown) => typeof id === 'number'));
    }

    const tags = tagDB.getTagsForTodo(todo.id);
    return NextResponse.json({ ...todo, subtasks: [], tags }, { status: 201 });
  } catch (error) {
    console.error('POST /api/todos error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
