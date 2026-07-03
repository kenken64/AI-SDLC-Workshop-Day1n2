import { NextRequest, NextResponse } from 'next/server';
import { todoDB, subtaskDB, tagDB } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';
import { getSession } from '@/lib/auth';

function getDateString(): string {
  return getSingaporeNow().toISOString().slice(0, 10);
}

function buildCSV(todos: ReturnType<typeof todoDB.findAll>): string {
  const headers = ['ID', 'Title', 'Completed', 'Due Date', 'Priority', 'Recurring', 'Pattern', 'Reminder (min)'];
  const rows = todos.map(t => [
    t.id,
    `"${t.title.replace(/"/g, '""')}"`,
    t.completed ? 'true' : 'false',
    t.due_date ?? '',
    t.priority,
    t.is_recurring ? 'true' : 'false',
    t.recurrence_pattern ?? '',
    t.reminder_minutes ?? '',
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const format = new URL(request.url).searchParams.get('format') ?? 'json';
  const todos = todoDB.findByUserId(session.userId);

  if (format === 'csv') {
    return new NextResponse(buildCSV(todos), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="todos-${getDateString()}.csv"`,
      },
    });
  }

  const enriched = todos.map(todo => ({
    ...todo,
    subtasks: subtaskDB.findByTodoId(todo.id),
    tags: tagDB.getTagsForTodo(todo.id).map(t => ({ name: t.name, color: t.color })),
  }));

  return new NextResponse(JSON.stringify(enriched, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="todos-${getDateString()}.json"`,
    },
  });
}
