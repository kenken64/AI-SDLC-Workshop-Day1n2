# Calendar View

Visualize todos on a monthly calendar grid, color-coded by priority, with Singapore public holidays overlaid, so users can spot scheduling conflicts and plan ahead at a glance.

**Dependencies**: Reads todos created via [PRP 01: Todo CRUD Operations](./01-todo-crud-operations.md), color-coded using the priority levels from [PRP 02: Priority System](./02-priority-system.md). Adds a new `/calendar` route, protected by the same auth middleware defined in [PRP 11: WebAuthn/Passkeys Authentication](./11-authentication-webauthn.md).

[← PRP Index](./README.md)

---

## Feature Overview

The Calendar View is a monthly grid (`/calendar`) that plots every todo with a `due_date` onto its due date cell, color-coded by priority, alongside Singapore public holidays. It is a read-oriented companion to the main list view (`app/page.tsx`) — no new todo data model, just a new rendering surface (`app/calendar/page.tsx`) and a small `holidays` table/endpoint that this PRP owns exclusively.

Core capabilities:
- Month grid (Sun–Sat) with prev/next/today navigation and `?month=YYYY-MM` URL state.
- Todos rendered as color-coded pills on their due date; overflow collapses to "+X more".
- Singapore public holidays rendered with distinct styling and their name.
- Click any day to open a modal listing all todos due that day.

## User Stories

- **As a user planning my week**, I want to see all my todos laid out on a calendar so I can spot days that are overloaded before they happen.
- **As a user reviewing my month**, I want high-priority todos to visually stand out in red on the calendar so I don't miss anything urgent while scanning.
- **As a user in Singapore**, I want public holidays shown on the calendar so I can plan work around them without checking a separate source.
- **As a user who just created a todo with a due date**, I want it to immediately show up in the correct cell when I switch to calendar view, with no extra steps.
- **As a user browsing a busy day**, I want to click that day and see the full list of todos due, since the cell itself doesn't have room to show everything.
- **As a user who bookmarked or refreshed the page**, I want the calendar to reopen on the month I was viewing, not always reset to the current month.

## User Flow

1. User clicks the **"Calendar"** button (purple, top navigation) from the main todo list page.
2. Browser navigates to `/calendar` (or `/calendar?month=YYYY-MM` if a month was previously selected); `middleware.ts` verifies the session cookie before rendering, same as `/`.
3. Page loads the current month by default (or the month from the `month` query param if present and valid).
4. Grid renders: 6 rows × 7 columns, day headers Sun–Sat, leading/trailing days from adjacent months shown dimmed, today's cell highlighted, weekend columns styled distinctly, past dates within the current month de-emphasized.
5. Todos with a `due_date` falling on a visible cell render as small color-coded pills (🔴 high / 🟡 medium / 🔵 low); holidays render as a labeled strip at the top of their cell.
6. If a cell has more todos than fit, a "+X more" indicator appears.
7. User clicks **◀ / ▶** to move a month, or **Today** to jump back to the current month; the URL updates to `?month=YYYY-MM` on every navigation (replace, not push, to avoid polluting browser history per click — implementers may choose push if back/forward-per-month is desired, but must be consistent).
8. User clicks any day cell → `DayTodosModal` opens, listing every todo due that day (title, priority badge, completion state) and the holiday name if one falls on that date.
9. User clicks a link (e.g. "List" / app logo) to return to `/`, where the same todos are visible in list form.

## Technical Requirements

### Database Schema

This PRP owns the `holidays` table (global, not `user_id`-scoped — public holidays apply to all users):

```sql
CREATE TABLE holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,     -- YYYY-MM-DD, Asia/Singapore
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_holidays_date ON holidays(date);
```

Seeded via `npx tsx scripts/seed-holidays.ts` (Singapore public holidays). Migrations for this table use the project's standard try-catch `ALTER TABLE` pattern in `db.exec()` if columns are added later.

Todos are read from the existing `todos` table (owned by PRP 01); this PRP adds no columns to it. Only `id`, `title`, `due_date`, `priority`, and `completed` are needed for rendering.

### Types

```typescript
// lib/db.ts
export interface Holiday {
  id: number;
  date: string; // YYYY-MM-DD
  name: string;
}

// Calendar grid cell — computed client/server side, not persisted
export interface CalendarDay {
  date: string;          // YYYY-MM-DD, Singapore-local
  isCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  isWeekend: boolean;
}
```

### Grid Generation

Pure function, unit-testable in isolation, no DOM/DB dependency:

```typescript
// lib/calendar.ts
import { getSingaporeNow, formatSingaporeDate } from '@/lib/timezone';

export function generateCalendarGrid(year: number, month: number): CalendarDay[] {
  // month is 1-indexed (1 = January) for readability at call sites
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startWeekday = firstOfMonth.getUTCDay(); // 0 = Sunday
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const today = formatSingaporeDate(getSingaporeNow(), 'YYYY-MM-DD');
  const cells: CalendarDay[] = [];

  // Always emit exactly 6 rows (42 cells) so month-to-month navigation
  // never changes grid height, regardless of how many rows the month needs.
  const totalCells = 42;
  const leadingDays = startWeekday;

  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - leadingDays + 1;
    const cellDate = new Date(Date.UTC(year, month - 1, dayOffset));
    const dateStr = formatSingaporeDate(cellDate, 'YYYY-MM-DD');
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
```

### API Endpoints

**`GET /api/holidays?year=YYYY&month=MM`**
- Requires session (same auth check as all other routes, even though holiday data isn't user-scoped — keeps the route consistent with the rest of the API surface).
- `year`/`month` are optional; when provided, scopes to holidays falling within that calendar month (plus a few days of padding to cover leading/trailing grid days from adjacent months); when omitted, returns all holidays.
- Scoping by visible month is preferred over always returning the full table: the holiday set is small today, but scoping keeps the endpoint's cost independent of how many years of holidays are seeded, and avoids the client needing to filter.

```typescript
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const year = searchParams.get('year');
  const month = searchParams.get('month');

  const holidays = year && month
    ? holidayDB.findByMonth(Number(year), Number(month))
    : holidayDB.findAll();

  return NextResponse.json({ holidays });
}
```

Todos for the visible month are fetched via the existing `GET /api/todos` (PRP 01) and filtered client-side by `due_date` falling within the grid's visible range — no new todo endpoint is introduced.

## UI Components

### `app/calendar/page.tsx` ('use client')

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarGrid } from '@/components/CalendarGrid';
import { DayTodosModal } from '@/components/DayTodosModal';
import type { Todo, Holiday } from '@/lib/db';

function parseMonthParam(raw: string | null): { year: number; month: number } {
  const now = new Date();
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split('-').map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default function CalendarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { year, month } = parseMonthParam(searchParams.get('month'));

  const [todos, setTodos] = useState<Todo[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/todos').then(r => r.json()).then(d => setTodos(d.todos));
    fetch(`/api/holidays?year=${year}&month=${month}`)
      .then(r => r.json()).then(d => setHolidays(d.holidays));
  }, [year, month]);

  function navigate(nextYear: number, nextMonth: number) {
    router.push(`/calendar?month=${nextYear}-${String(nextMonth).padStart(2, '0')}`);
  }

  return (
    <div>
      <CalendarGrid
        year={year}
        month={month}
        todos={todos}
        holidays={holidays}
        onSelectDay={setSelectedDate}
        onNavigate={navigate}
      />
      {selectedDate && (
        <DayTodosModal
          date={selectedDate}
          todos={todos.filter(t => t.due_date?.startsWith(selectedDate))}
          holiday={holidays.find(h => h.date === selectedDate)}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
```

### `CalendarGrid`

Renders the 6×7 grid from `generateCalendarGrid`, day-of-week headers, and prev/next/today controls. Each cell delegates rendering to `CalendarCell`.

### `CalendarCell`

```tsx
const MAX_VISIBLE_TODOS = 3;

function CalendarCell({ day, todos, holiday, onClick }: CalendarCellProps) {
  const visible = todos.slice(0, MAX_VISIBLE_TODOS);
  const overflow = todos.length - visible.length;

  return (
    <button
      onClick={() => onClick(day.date)}
      className={cellClasses(day)} // handles isToday / isPast / isWeekend / !isCurrentMonth
    >
      <span className="cell-date">{day.date.split('-')[2]}</span>
      {holiday && <span className="holiday-label">{holiday.name}</span>}
      {visible.map(t => (
        <span key={t.id} className={`todo-pill priority-${t.priority}`}>{t.title}</span>
      ))}
      {overflow > 0 && <span className="overflow-badge">+{overflow} more</span>}
    </button>
  );
}
```

### `DayTodosModal`

Modal listing every todo due on the clicked date in full (title, priority badge, completion checkbox state — read-only summary, not an edit form) plus the holiday name if present.

## Edge Cases

- **5-row vs. 6-row months**: `generateCalendarGrid` always emits exactly 42 cells (6 fixed rows) regardless of how many weeks the month actually spans, so the grid height never jumps when navigating between months.
- **Day with many todos**: only `MAX_VISIBLE_TODOS` (3) pills render per cell; the rest collapse into "+X more", fully visible via the day-detail modal.
- **Invalid `?month=` param**: malformed (`abc`), out-of-range month (`2026-13`), or missing value falls back silently to the current Singapore month — never a 500 or blank grid.
- **Unbounded navigation**: prev/next are not range-limited; a user can navigate arbitrarily far into the past or future (todos and holidays simply render empty for months with no data). No artificial floor/ceiling is imposed.
- **Holiday and todo on the same date**: both render — holiday label at the top of the cell, todo pills below it, without one hiding the other.
- **Timezone boundary**: a todo with `due_date` of `2026-03-01T00:30` (12:30am Singapore time) must render on March 1's cell, not Feb 28's — grid generation and todo-to-cell matching both go through `lib/timezone.ts`, never raw UTC `Date` comparisons.
- **Todo with no `due_date`**: never rendered on the calendar (calendar is due-date-only; undated todos remain list-view-only, consistent with PRP 01).
- **Leap year February**: `generateCalendarGrid(2028, 2)` must produce 29 valid days in February, not 28.
- **Cross-route filter state**: if the user had active list-view filters (PRP 08) before switching to Calendar, those filters are not applied to the calendar grid — the calendar always shows all of the user's todos with due dates. This is a deliberate scope boundary, see Out of Scope.

## Acceptance Criteria

- [ ] `/calendar` is protected by `middleware.ts` — unauthenticated users are redirected to `/login`.
- [ ] Calendar defaults to the current Singapore month when no `?month=` param is present.
- [ ] `?month=YYYY-MM` in the URL selects that month on load, and updates on every prev/next/today navigation.
- [ ] All 7 day-of-week headers render (Sun–Sat), and every grid always has exactly 6 rows.
- [ ] Today's cell is visually highlighted; past dates in the current month are visually de-emphasized; weekend columns are styled distinctly from weekdays.
- [ ] Every todo with a `due_date` appears on the correct Singapore-local date cell.
- [ ] Todo pills are color-coded by priority (red/yellow/blue matching PRP 02's palette).
- [ ] Cells with more than 3 todos show a "+X more" indicator instead of overflowing the cell.
- [ ] Holidays render with their name on the correct date cell.
- [ ] Clicking any day cell opens a modal listing all todos due that day plus the holiday (if any).
- [ ] Prev/Today/Next controls correctly move the grid by exactly one month / reset to the current month.
- [ ] Invalid or out-of-range `?month=` values fall back to the current month without error.

## Testing Requirements

Test file: `tests/12-calendar.spec.ts`. E2E tests use the existing virtual WebAuthn authenticator session and `tests/helpers.ts` (`createTodo()`) to seed data before assertions.

**E2E:**
- [ ] Navigating to `/calendar` from `/` renders the current month.
- [ ] A todo created with a due date in the visible month appears on the correct calendar cell.
- [ ] Clicking ◀ moves to the previous month and updates the URL to `?month=YYYY-MM`.
- [ ] Clicking ▶ moves to the next month and updates the URL.
- [ ] Clicking "Today" from a navigated-away month returns to the current month.
- [ ] A seeded holiday renders with its name on the correct date.
- [ ] Clicking a day with todos opens `DayTodosModal` listing all of that day's todos.
- [ ] Loading `/calendar?month=2026-13` (invalid) falls back to the current month without a crash.
- [ ] Unauthenticated navigation to `/calendar` redirects to `/login`.

**Unit tests (`generateCalendarGrid`):**
- [ ] A 28-day February (non-leap year) produces the correct 6×7 grid with the right leading/trailing days.
- [ ] A 29-day February (leap year, e.g. 2028) includes Feb 29 as a current-month cell.
- [ ] A 31-day month starting on Sunday vs. starting on Saturday both produce exactly 42 cells.
- [ ] `isToday` is true for exactly one cell when the grid includes the current date, and false for all cells otherwise.
- [ ] `isWeekend` is true only for Sunday/Saturday columns regardless of month.
- [ ] `isPast` correctly reflects Singapore "today", not UTC "today", for dates within a few hours of the UTC/SGT day boundary.

## Out of Scope

- Week, day, or agenda calendar views — month view only.
- Drag-and-drop rescheduling of todos directly on the calendar.
- Creating or editing todos inline from the calendar grid or day modal (creation remains via the main todo form on `/`).
- Syncing the calendar view with the main list view's active search/priority/tag/date filters (PRP 08) — the calendar always shows the full unfiltered set of due-dated todos.
- External calendar integration (Google Calendar, iCal export/subscribe).
- Recurring todo "ghost" projections onto future months before an instance actually exists (only real, persisted todo rows are rendered — see PRP 03).
- Multi-user/shared calendars — each user sees only their own todos, plus the shared global holiday set.

## Success Metrics

- 100% of todos with a `due_date` render on the Singapore-calendar-correct date cell (zero timezone-boundary misplacement).
- Month navigation (prev/next/today) completes and re-renders the grid in under 200ms on a typical dataset (<500 todos).
- `GET /api/holidays` for a scoped month responds in under 100ms.
- Zero layout shift in grid height when navigating between 5-row-equivalent and 6-row-equivalent months (since the grid always renders 6 fixed rows).
- Grid generation (`generateCalendarGrid`) has 100% unit test coverage across short months, long months, and leap-year Februarys.
