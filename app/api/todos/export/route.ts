import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { getSingaporeDateString } from '@/lib/timezone';

function csvEscape(value: string | null | undefined | boolean | number): string {
  const str = String(value ?? '');
  if (/[,"\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const format = request.nextUrl.searchParams.get('format') ?? 'json';
  const todos = todoDB.findAllWithRelations(session.userId);
  const dateStr = getSingaporeDateString();

  if (format === 'csv') {
    const header = 'ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder';
    const rows = todos.map((t) =>
      [
        csvEscape(t.id),
        csvEscape(t.title),
        csvEscape(t.completed ? 'true' : 'false'),
        csvEscape(t.due_date ?? ''),
        csvEscape(t.priority),
        csvEscape(t.is_recurring ? 'true' : 'false'),
        csvEscape(t.recurrence_pattern ?? ''),
        csvEscape(t.reminder_minutes != null ? String(t.reminder_minutes) : ''),
      ].join(','),
    );
    const csv = [header, ...rows].join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="todos-${dateStr}.csv"`,
      },
    });
  }

  const payload = {
    version: 1 as const,
    exported_at: new Date().toISOString(),
    todos: todos.map((t) => ({
      title: t.title,
      completed: t.completed,
      due_date: t.due_date,
      priority: t.priority,
      is_recurring: t.is_recurring,
      recurrence_pattern: t.recurrence_pattern,
      reminder_minutes: t.reminder_minutes,
      created_at: t.created_at,
      subtasks: (t.subtasks ?? []).map((s) => ({
        title: s.title,
        completed: s.completed,
        position: s.position,
      })),
      tags: (t.tags ?? []).map((tag) => ({
        name: tag.name,
        color: tag.color,
      })),
    })),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="todos-${dateStr}.json"`,
    },
  });
}
