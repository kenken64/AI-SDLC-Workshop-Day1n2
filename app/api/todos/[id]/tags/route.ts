import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, tagDB } from '@/lib/db';

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

  const todo = todoDB.findById(Number(id), session.userId);
  if (!todo) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });

  const tagId = typeof body.tag_id === 'number' ? body.tag_id : Number(body.tag_id);
  if (!Number.isInteger(tagId) || tagId <= 0) {
    return NextResponse.json({ error: 'tag_id is required' }, { status: 400 });
  }

  const tag = tagDB.findById(tagId, session.userId);
  if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });

  tagDB.attachToTodo(todo.id, tag.id);
  return NextResponse.json({ success: true });
}

export async function DELETE(
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

  const todo = todoDB.findById(Number(id), session.userId);
  if (!todo) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });

  const tagId = typeof body.tag_id === 'number' ? body.tag_id : Number(body.tag_id);
  if (!Number.isInteger(tagId) || tagId <= 0) {
    return NextResponse.json({ error: 'tag_id is required' }, { status: 400 });
  }

  tagDB.detachFromTodo(todo.id, tagId);
  return NextResponse.json({ success: true });
}
