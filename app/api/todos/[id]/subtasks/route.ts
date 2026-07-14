import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, subtaskDB } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const todo = todoDB.findById(Number(id), session.userId);
  if (!todo) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });

  return NextResponse.json(subtaskDB.findByTodoId(todo.id));
}

export async function POST(
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

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: 'Subtask title is required' }, { status: 400 });

  const todo = todoDB.findById(Number(id), session.userId);
  if (!todo) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });

  const subtask = subtaskDB.create({ todo_id: todo.id, title });
  return NextResponse.json(subtask, { status: 201 });
}
