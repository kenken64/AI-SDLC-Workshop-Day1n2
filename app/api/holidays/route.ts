import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { holidayDB } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get('year');
  const monthParam = searchParams.get('month');

  if (yearParam && monthParam) {
    const year = Number(yearParam);
    const month = Number(monthParam);
    if (!Number.isNaN(year) && !Number.isNaN(month) && month >= 1 && month <= 12) {
      // Add 7-day buffer to cover calendar grid leading/trailing days from adjacent months
      const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
      const lastOfMonth = new Date(Date.UTC(year, month, 0));
      const from = new Date(firstOfMonth.getTime() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const to = new Date(lastOfMonth.getTime() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      return NextResponse.json({ holidays: holidayDB.findByDateRange(from, to) });
    }
  }

  return NextResponse.json({ holidays: holidayDB.findAll() });
}
