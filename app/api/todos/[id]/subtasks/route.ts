import { NextRequest, NextResponse } from 'next/server';
import { todoDB, subtaskDB } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const todoId = parseInt(id, 10);
  if (isNaN(todoId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const todo = todoDB.findById(todoId);
  if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(subtaskDB.findByTodoId(todoId));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const todoId = parseInt(id, 10);
    if (isNaN(todoId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const todo = todoDB.findById(todoId);
    if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await request.json();
    const { title } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (title.trim().length > 500) {
      return NextResponse.json({ error: 'Title must be 500 characters or fewer' }, { status: 400 });
    }

    const subtask = subtaskDB.create({ todoId, title: title.trim() });
    return NextResponse.json(subtask, { status: 201 });
  } catch (error) {
    console.error('POST /api/todos/[id]/subtasks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
