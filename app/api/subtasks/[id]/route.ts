import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { subtaskDB, todoDB } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const subtask = subtaskDB.findById(Number(id));
  if (!subtask) return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });

  // Ownership check: subtask → parent todo → session.userId
  const todo = todoDB.findById(subtask.todo_id, session.userId);
  if (!todo) return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });

  const data: { title?: string; completed?: boolean } = {};
  if (typeof body.title === 'string') data.title = body.title.trim() || undefined;
  if (typeof body.completed === 'boolean') data.completed = body.completed;

  const updated = subtaskDB.update(Number(id), data);
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;

  const subtask = subtaskDB.findById(Number(id));
  if (!subtask) return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });

  // Ownership check
  const todo = todoDB.findById(subtask.todo_id, session.userId);
  if (!todo) return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });

  subtaskDB.delete(Number(id));
  return NextResponse.json({ success: true });
}
