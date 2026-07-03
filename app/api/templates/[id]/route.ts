import { NextRequest, NextResponse } from 'next/server';
import { templateDB, SYSTEM_USER_ID } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const templateId = parseInt(id, 10);
    if (isNaN(templateId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const existing = templateDB.findById(templateId);
    if (!existing || existing.user_id !== session.userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    templateDB.delete(templateId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/templates/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
