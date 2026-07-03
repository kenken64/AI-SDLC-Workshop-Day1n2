# PRP 10 — Calendar View

## Feature Overview

A monthly calendar page (`/calendar`) visualises todos on their due dates as color-coded pills (by priority). Singapore public holidays are displayed with special styling when seeded. The user can navigate between months. Todos without due dates are not shown. The calendar is read-only — editing happens on the main list view. The calendar is a protected route requiring authentication.

---

## User Stories

| Persona | Story | Acceptance Criteria |
|---------|-------|---------------------|
| Weekly planner | As a user, I want to see all my due todos on a calendar so I can spot busy days | Todos appear on correct due-date cells |
| Visual thinker | As a user, I want color-coded todo pills by priority so I can scan urgency across dates | Red/Yellow/Blue pills matching priority |
| Navigator | As a user, I want to navigate between months so I can plan ahead or review the past | ◀ / ▶ buttons and Today button |
| Holiday planner | As a user, I want Singapore public holidays shown so I can plan around them | Holiday names shown on calendar cells |
| Mobile user | As a user, I want the calendar to be readable on mobile | Responsive grid, truncated titles with tooltip |

---

## User Flow

### Accessing Calendar
1. User clicks **📅 Calendar** button (top-right of main todo page)
2. Navigates to `/calendar`
3. Current month displayed with todos on their due dates

### Navigating Months
1. Click **◀** to go to previous month
2. Click **▶** to go to next month
3. Click **Today** to jump back to current month

### Viewing a Busy Day
1. Calendar cells show up to 3 todo pills stacked
2. If more than 3 todos on a day, "+N more" indicator shown
3. Pills show truncated title; full title in `title` tooltip attribute

### Holiday Display
1. Holiday name shown below the day number in holiday cells
2. Holiday cells have distinct background (e.g., `bg-amber-50`)
3. Holidays loaded from `holidays` table (seeded separately)

---

## Technical Requirements

### Database Schema — Holidays (`lib/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,      -- 'YYYY-MM-DD'
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'SG'
);
```

### TypeScript Interface

```typescript
export interface Holiday {
  id: number;
  date: string;   // 'YYYY-MM-DD'
  name: string;
  country: string;
}
```

### DB Operations

```typescript
export const holidayDB = {
  findByMonth(year: number, month: number): Holiday[] {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    return db.prepare(
      "SELECT * FROM holidays WHERE date LIKE ? AND country = 'SG'"
    ).all(`${prefix}%`) as Holiday[];
  },
};
```

### Holiday Seeding Script (`scripts/seed-holidays.ts`)

```typescript
// Singapore public holidays 2025-2026
// Run with: npx tsx scripts/seed-holidays.ts
const HOLIDAYS = [
  { date: '2025-01-01', name: "New Year's Day" },
  { date: '2025-01-29', name: 'Chinese New Year' },
  { date: '2025-01-30', name: 'Chinese New Year (Day 2)' },
  { date: '2025-03-31', name: 'Hari Raya Puasa' },
  { date: '2025-04-18', name: 'Good Friday' },
  { date: '2025-05-01', name: 'Labour Day' },
  { date: '2025-05-12', name: 'Vesak Day' },
  { date: '2025-06-07', name: 'Hari Raya Haji' },
  { date: '2025-08-09', name: 'National Day' },
  { date: '2025-10-20', name: 'Deepavali' },
  { date: '2025-12-25', name: 'Christmas Day' },
  // 2026
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-02-17', name: 'Chinese New Year' },
  { date: '2026-02-18', name: 'Chinese New Year (Day 2)' },
  { date: '2026-03-20', name: 'Hari Raya Puasa' },
];
```

### API Endpoint

#### `GET /api/calendar?year=2025&month=10`

```typescript
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear()));
  const month = parseInt(url.searchParams.get('month') ?? String(new Date().getMonth()));

  const todos = todoDB.findByUserId(session.userId).filter(
    t => t.due_date && t.due_date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}-`)
  );
  const holidays = holidayDB.findByMonth(year, month);

  return NextResponse.json({ todos, holidays });
}
```

Alternatively, the client can derive the month's todos from the already-fetched `GET /api/todos` response (all todos) and only fetch holidays from a `/api/holidays?year=Y&month=M` endpoint.

---

## UI Components

### Calendar Grid (`app/calendar/page.tsx`)

```
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│ Sun │ Mon │ Tue │ Wed │ Thu │ Fri │ Sat │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│     │     │     │  1  │  2  │  3  │  4  │
│     │     │     │ 🔴T1│     │ 🟡T2│     │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
...
```

### Day Cell

```tsx
function DayCell({ day, todos, holiday, isToday, isPast }: DayCellProps) {
  return (
    <div className={`min-h-20 p-1.5 border-t border-r border-gray-100 dark:border-gray-700 ${
      isToday ? 'bg-blue-50 dark:bg-blue-950/30' :
      holiday ? 'bg-amber-50 dark:bg-amber-950/20' :
      isPast ? 'bg-gray-50/50 dark:bg-gray-900/10' : ''
    }`}>
      {/* Day number */}
      <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
        isToday ? 'bg-blue-600 text-white' : 'text-gray-700 dark:text-gray-300'
      }`}>
        {day}
      </div>

      {/* Holiday name */}
      {holiday && (
        <div className="text-xs text-amber-700 dark:text-amber-400 truncate mb-0.5" title={holiday.name}>
          🎉 {holiday.name}
        </div>
      )}

      {/* Todo pills */}
      <div className="space-y-0.5">
        {todos.slice(0, 3).map(todo => (
          <div
            key={todo.id}
            className={`text-xs text-white px-1 py-0.5 rounded truncate ${PRIORITY_BG[todo.priority]}`}
            title={todo.title}
          >
            {todo.title}
          </div>
        ))}
        {todos.length > 3 && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            +{todos.length - 3} more
          </div>
        )}
      </div>
    </div>
  );
}
```

### Priority Colors for Calendar

```typescript
const PRIORITY_BG: Record<Priority, string> = {
  high:   'bg-red-500',
  medium: 'bg-yellow-400',
  low:    'bg-blue-400',
};
```

### Month Navigation

```tsx
<div className="flex items-center gap-2">
  <button onClick={prevMonth}>◀</button>
  <span className="font-semibold min-w-36 text-center">{monthName}</span>
  <button onClick={nextMonth}>▶</button>
  <button onClick={goToday}>Today</button>
</div>
```

### Legend

```tsx
<div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
  <span><span className="inline-block w-3 h-3 rounded bg-red-500" /> High</span>
  <span><span className="inline-block w-3 h-3 rounded bg-yellow-400" /> Medium</span>
  <span><span className="inline-block w-3 h-3 rounded bg-blue-400" /> Low</span>
</div>
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Month with no todos | Calendar renders normally; cells are empty |
| Multiple todos same day | Stack up to 3; show "+N more" for overflow |
| Todo title very long | CSS `truncate`, full title in `title` attribute for tooltip |
| Completed todos | Shown on calendar (strikethrough or dimmed) |
| Month starting on different days | `getFirstDayOfMonth` calculates blank leading cells |
| February in leap year | `getDaysInMonth` uses `new Date(year, month+1, 0).getDate()` |
| Holiday + many todos same day | Holiday shown first, then todo pills |
| Navigating to far-future month | No todos shown; calendar still renders |

---

## Acceptance Criteria

- [ ] Calendar accessible at `/calendar` (protected, auth required)
- [ ] Current month shown by default
- [ ] Todos with due dates appear on correct calendar cells
- [ ] Todo pills color-coded by priority (Red/Yellow/Blue)
- [ ] Up to 3 todo pills per cell; "+N more" for overflow
- [ ] Full todo title shown in tooltip on hover
- [ ] Today's date highlighted (blue circle)
- [ ] Past dates visually dimmed
- [ ] ◀ / ▶ buttons navigate to previous/next month
- [ ] **Today** button jumps back to current month
- [ ] Singapore public holidays shown when seeded
- [ ] Color legend displayed below calendar
- [ ] Responsive layout — usable on mobile

---

## Testing Requirements

### E2E Tests (`tests/11-calendar.spec.ts`)

```typescript
test('todo appears on correct calendar date', async ({ page }) => {
  const futureDate = '2026-08-15T10:00'; // specific date
  await helpers.createTodo(page, { title: 'Calendar test', dueDate: futureDate });
  await page.getByRole('link', { name: 'Calendar' }).click();
  // Navigate to August 2026
  // ...
  await expect(page.getByTitle('Calendar test')).toBeVisible();
});

test('calendar navigation works', async ({ page }) => {
  await page.goto('/calendar');
  const currentMonth = await page.locator('[data-testid="month-label"]').textContent();
  await page.getByRole('button', { name: '▶' }).click();
  const nextMonth = await page.locator('[data-testid="month-label"]').textContent();
  expect(currentMonth).not.toBe(nextMonth);
});

test('today button returns to current month', async ({ page }) => {
  await page.goto('/calendar');
  await page.getByRole('button', { name: '▶' }).click();
  await page.getByRole('button', { name: '▶' }).click();
  await page.getByRole('button', { name: 'Today' }).click();
  const today = new Date();
  const monthLabel = await page.locator('[data-testid="month-label"]').textContent();
  expect(monthLabel).toContain(String(today.getFullYear()));
});
```

---

## Out of Scope

- Week view or day view
- Clicking a date to create a todo from calendar
- Drag-and-drop rescheduling on calendar
- International / non-Singapore holiday sets
- Calendar sharing / export as `.ics`

---

## Success Metrics

- Calendar renders in < 300ms after navigation
- Correct todo placement on all days across different months
- Holiday display accurate for SG public holiday schedule
