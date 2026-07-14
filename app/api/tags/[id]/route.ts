import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { tagDB } from '@/lib/db';

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

  const tag = tagDB.findById(Number(id), session.userId);
  if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });

  const data: { name?: string; color?: string } = {};
  if (typeof body.name === 'string') {
    const trimmed = body.name.trim();
    if (!trimmed) return NextResponse.json({ error: 'Tag name cannot be empty' }, { status: 400 });
    data.name = trimmed;
  }
  if (typeof body.color === 'string') {
    if (!/^#[0-9A-Fa-f]{6}$/.test(body.color)) {
      return NextResponse.json({ error: 'Color must be a valid hex code' }, { status: 400 });
    }
    data.color = body.color;
  }

  try {
    const updated = tagDB.update(Number(id), session.userId, data);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'A tag with this name already exists' }, { status: 409 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;

  const tag = tagDB.findById(Number(id), session.userId);
  if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });

  tagDB.delete(Number(id), session.userId);
  return NextResponse.json({ success: true });
}
