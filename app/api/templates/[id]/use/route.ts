import { NextRequest, NextResponse } from 'next/server';
import { templateDB, todoDB, subtaskDB, SYSTEM_USER_ID, TemplateSubtask } from '@/lib/db';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const templateId = parseInt(id, 10);
    if (isNaN(templateId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const template = templateDB.findById(templateId);
    if (!template || template.user_id !== SYSTEM_USER_ID) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const todo = todoDB.create({
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
