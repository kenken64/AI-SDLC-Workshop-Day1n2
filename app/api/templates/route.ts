import { NextRequest, NextResponse } from 'next/server';
import { templateDB, SYSTEM_USER_ID, Priority, RecurrencePattern } from '@/lib/db';

export async function GET() {
  return NextResponse.json(templateDB.findByUserId(SYSTEM_USER_ID));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, category, titleTemplate, priority, isRecurring, recurrencePattern, reminderMinutes } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
    }
    if (!titleTemplate || typeof titleTemplate !== 'string' || !titleTemplate.trim()) {
      return NextResponse.json({ error: 'Todo title template is required' }, { status: 400 });
    }
    if (priority && !['high', 'medium', 'low'].includes(priority)) {
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
    }

    const template = templateDB.create({
      userId: SYSTEM_USER_ID,
      name: name.trim(),
      description: description?.trim() || undefined,
      category: category?.trim() || undefined,
      titleTemplate: titleTemplate.trim(),
      priority: (priority as Priority) ?? 'medium',
      isRecurring: !!isRecurring,
      recurrencePattern: isRecurring ? ((recurrencePattern as RecurrencePattern) ?? null) : null,
      reminderMinutes: reminderMinutes ?? null,
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('POST /api/templates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
