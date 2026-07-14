import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { templateDB } from '@/lib/db';
import type { Priority, RecurrencePattern } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json(templateDB.findByUserId(session.userId));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const title_template = typeof body.title_template === 'string' ? body.title_template.trim() : '';
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  if (!title_template) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const is_recurring = Boolean(body.is_recurring);
  const due_date_offset_minutes =
    typeof body.due_date_offset_minutes === 'number' ? body.due_date_offset_minutes : null;

  if (is_recurring && due_date_offset_minutes == null) {
    return NextResponse.json(
      { error: 'Recurring templates require a due date offset' },
      { status: 400 },
    );
  }

  const subtasksRaw = Array.isArray(body.subtasks)
    ? (body.subtasks as Array<{ title?: unknown }>)
        .filter((s) => typeof s.title === 'string' && s.title.trim())
        .map((s, i) => ({ title: (s.title as string).trim(), position: i }))
    : [];
  const subtasks_json = subtasksRaw.length > 0 ? JSON.stringify(subtasksRaw) : null;

  const template = templateDB.create({
    user_id: session.userId,
    name,
    description: typeof body.description === 'string' ? body.description.trim() || null : null,
    category: typeof body.category === 'string' ? body.category.trim() || null : null,
    title_template,
    priority: (body.priority as Priority) ?? 'medium',
    is_recurring,
    recurrence_pattern: (body.recurrence_pattern as RecurrencePattern | undefined) ?? null,
    reminder_minutes: typeof body.reminder_minutes === 'number' ? body.reminder_minutes : null,
    due_date_offset_minutes,
    subtasks_json,
  });

  return NextResponse.json(template, { status: 201 });
}
