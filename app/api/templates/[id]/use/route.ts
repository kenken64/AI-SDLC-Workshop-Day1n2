import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { templateDB, todoDB, subtaskDB } from '@/lib/db';
import { formatSingaporeDate } from '@/lib/timezone';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const template = templateDB.findById(Number(id), session.userId);
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  const due_date =
    template.due_date_offset_minutes != null
      ? formatSingaporeDate(
          new Date(Date.now() + template.due_date_offset_minutes * 60 * 1000),
        )
      : null;

  const todo = todoDB.create({
    user_id: session.userId,
    title: template.title_template,
    priority: template.priority,
    due_date,
    is_recurring: !!template.is_recurring,
    recurrence_pattern: template.recurrence_pattern,
    reminder_minutes: template.reminder_minutes,
  });

  let subtasks: Array<{ title: string; position: number }> = [];
  if (template.subtasks_json) {
    try {
      subtasks = JSON.parse(template.subtasks_json) as Array<{ title: string; position: number }>;
    } catch {
      subtasks = [];
    }
  }

  for (const s of subtasks) {
    subtaskDB.create({ todo_id: todo.id, title: s.title });
  }

  const createdSubtasks = subtaskDB.findByTodoId(todo.id);
  return NextResponse.json({ ...todo, subtasks: createdSubtasks, tags: [] }, { status: 201 });
}
