import { NextRequest, NextResponse } from 'next/server';
import { templateDB, todoDB, subtaskDB, SYSTEM_USER_ID, TemplateSubtask } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const templateId = parseInt(id, 10);
    if (isNaN(templateId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const template = templateDB.findById(templateId);
    if (!template || template.user_id !== session.userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const todo = todoDB.create({
      userId: session.userId,
      title: template.title_template,
      priority: template.priority,
      due_date: null,
      is_recurring: template.is_recurring === 1,
      recurrence_pattern: template.recurrence_pattern,
      reminder_minutes: template.reminder_minutes,
    });

    if (template.subtasks_json) {
      const subtasks: TemplateSubtask[] = JSON.parse(template.subtasks_json);
      for (const sub of subtasks) {
        subtaskDB.create({ todoId: todo.id, title: sub.title });
      }
    }

    return NextResponse.json(todo, { status: 201 });
  } catch (error) {
    console.error('POST /api/templates/[id]/use error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
