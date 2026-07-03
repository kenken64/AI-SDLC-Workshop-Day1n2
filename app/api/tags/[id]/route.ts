import { NextRequest, NextResponse } from 'next/server';
import { tagDB, SYSTEM_USER_ID } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const tagId = parseInt(id, 10);
    if (isNaN(tagId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const existing = tagDB.findById(tagId);
    if (!existing || existing.user_id !== session.userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, color } = body;

    if (name !== undefined && (!name || !name.trim())) {
      return NextResponse.json({ error: 'Tag name cannot be empty' }, { status: 400 });
    }
    if (name && name.trim().length > 50) {
      return NextResponse.json({ error: 'Tag name must be 50 characters or fewer' }, { status: 400 });
    }
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return NextResponse.json({ error: 'Invalid color format' }, { status: 400 });
    }

    try {
      const updated = tagDB.update(tagId, { name: name?.trim(), color });
      return NextResponse.json(updated);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('UNIQUE')) {
        return NextResponse.json({ error: 'Tag name already exists' }, { status: 400 });
      }
      throw e;
    }
  } catch (error) {
    console.error('PUT /api/tags/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const tagId = parseInt(id, 10);
    if (isNaN(tagId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const existing = tagDB.findById(tagId);
    if (!existing || existing.user_id !== session.userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    tagDB.delete(tagId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/tags/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
