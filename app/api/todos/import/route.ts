import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';

const importSchema = z.object({
  version: z.literal(1),
  exported_at: z.string(),
  todos: z.array(
    z.object({
      title: z.string().min(1),
      completed: z.boolean(),
      due_date: z.string().nullable(),
      priority: z.enum(['high', 'medium', 'low']),
      is_recurring: z.boolean(),
      recurrence_pattern: z.enum(['daily', 'weekly', 'monthly', 'yearly']).nullable(),
      reminder_minutes: z.number().int().nullable(),
      created_at: z.string(),
      subtasks: z.array(
        z.object({
          title: z.string().min(1),
          completed: z.boolean(),
          position: z.number().int(),
        }),
      ),
      tags: z.array(z.object({ name: z.string().min(1), color: z.string() })),
    }),
  ),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Failed to import todos. Please check the file format.' },
      { status: 400 },
    );
  }

  const result = todoDB.importAll(session.userId, parsed.data.todos);
  return NextResponse.json({ success: true, ...result });
}
