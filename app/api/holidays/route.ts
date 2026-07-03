import { NextRequest, NextResponse } from 'next/server';
import { holidayDB } from '@/lib/db';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear()), 10);
  const month = parseInt(url.searchParams.get('month') ?? String(new Date().getMonth()), 10);

  if (isNaN(year) || isNaN(month) || month < 0 || month > 11) {
    return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 });
  }

  return NextResponse.json(holidayDB.findByMonth(year, month));
}
