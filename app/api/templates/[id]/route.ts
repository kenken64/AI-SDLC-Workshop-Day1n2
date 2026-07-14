import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { templateDB } from '@/lib/db';
import type { Priority, RecurrencePattern } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const template = templateDB.findById(Number(id), session.userId);
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.name === 'string') updates.name = body.name.trim();
  if (body.description !== undefined)
    updates.description = typeof body.description === 'string' ? body.description.trim() || null : null;
  if (body.category !== undefined)
    updates.category = typeof body.category === 'string' ? body.category.trim() || null : null;
  if (typeof body.title_template === 'string') updates.title_template = body.title_template.trim();
  if (body.priority != null) updates.priority = body.priority as Priority;
  if (body.is_recurring != null) updates.is_recurring = Boolean(body.is_recurring);
  if (body.recurrence_pattern !== undefined)
    updates.recurrence_pattern = (body.recurrence_pattern as RecurrencePattern | null) ?? null;
  if (body.reminder_minutes !== undefined)
    updates.reminder_minutes =
      typeof body.reminder_minutes === 'number' ? body.reminder_minutes : null;
  if (body.due_date_offset_minutes !== undefined)
    updates.due_date_offset_minutes =
      typeof body.due_date_offset_minutes === 'number' ? body.due_date_offset_minutes : null;

  const updated = templateDB.update(Number(id), session.userId, updates as Parameters<typeof templateDB.update>[2]);
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  templateDB.delete(Number(id), session.userId);
  return NextResponse.json({ success: true });
}
