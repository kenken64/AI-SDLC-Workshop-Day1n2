import { getSingaporeDateString } from '@/lib/timezone';

export interface CalendarDay {
  date: string;           // YYYY-MM-DD, Singapore-local
  isCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  isWeekend: boolean;
}

/**
 * Generates a fixed 42-cell (6 rows × 7 columns) calendar grid for the given
 * year and 1-indexed month. Leading and trailing cells from adjacent months
 * fill the grid so the height never changes between months.
 */
export function generateCalendarGrid(year: number, month: number): CalendarDay[] {
  const today = getSingaporeDateString();
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startWeekday = firstOfMonth.getUTCDay(); // 0 = Sunday
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: CalendarDay[] = [];

  for (let i = 0; i < 42; i++) {
    const dayOffset = i - startWeekday + 1;
    const cellDate = new Date(Date.UTC(year, month - 1, dayOffset));
    const y = cellDate.getUTCFullYear();
    const m = String(cellDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cellDate.getUTCDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const weekday = cellDate.getUTCDay();

    cells.push({
      date: dateStr,
      isCurrentMonth: dayOffset >= 1 && dayOffset <= daysInMonth,
      isToday: dateStr === today,
      isPast: dateStr < today,
      isWeekend: weekday === 0 || weekday === 6,
    });
  }

  return cells;
}
