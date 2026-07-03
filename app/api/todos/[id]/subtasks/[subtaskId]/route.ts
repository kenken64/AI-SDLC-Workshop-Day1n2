import { NextRequest, NextResponse } from 'next/server';
import { todoDB, subtaskDB } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subtaskId: string }> }
) {
  try {
    const { id, subtaskId } = await params;
    const todoId = parseInt(id, 10);
    const sId = parseInt(subtaskId, 10);
    if (isNaN(todoId) || isNaN(sId)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const todo = todoDB.findById(todoId);
    if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await request.json();
    if (typeof body.completed !== 'boolean') {
      return NextResponse.json({ error: 'completed (boolean) is required' }, { status: 400 });
    }

    const updated = subtaskDB.update(sId, body.completed);
    if (!updated) return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('PUT /api/todos/[id]/subtasks/[subtaskId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; subtaskId: string }> }
) {
  try {
    const { id, subtaskId } = await params;
    const todoId = parseInt(id, 10);
    const sId = parseInt(subtaskId, 10);
    if (isNaN(todoId) || isNaN(sId)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const todo = todoDB.findById(todoId);
    if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const deleted = subtaskDB.delete(sId);
    if (!deleted) return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/todos/[id]/subtasks/[subtaskId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
