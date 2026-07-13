# Recurring Todos

Automatically create the next occurrence of a todo (daily/weekly/monthly/yearly) when the current instance is completed.

**Dependencies**: Extends the `todos` table and `POST /api/todos` / `PUT /api/todos/[id]` endpoints defined in [01-todo-crud-operations.md](./01-todo-crud-operations.md). Completing a recurring todo carries forward priority ([02-priority-system.md](./02-priority-system.md)), tags ([06-tag-system.md](./06-tag-system.md)), and reminder settings ([04-reminders-notifications.md](./04-reminders-notifications.md)) onto the newly created next instance.

[← PRP Index](./README.md)

## Feature Overview

Recurring todos let a user mark a todo as repeating on a fixed cadence — daily, weekly, monthly, or yearly. The user never manually re-creates the task: when they check off the current instance as complete, the system atomically creates a new todo for the next occurrence, copying over its priority, tags, recurrence pattern, and reminder offset, and computing a new due date from the recurrence pattern. Recurring todos are visually marked with a 🔄 badge showing the pattern.

This feature is intentionally simple: it supports exactly four fixed cadences, requires a due date to anchor the calculation, and only ever schedules one occurrence ahead (the next instance is not created until the current one is completed — there is no background scheduler pre-generating future occurrences).

## User Stories

- **As a user with daily habits** (exercise, medication), I want to create one "recurring" todo so I don't have to re-type it every day, and I want it to reappear automatically the moment I complete today's instance.
- **As a user with weekly obligations** (team meeting, status report), I want the next week's instance to already have the right priority and tags so I don't have to reconfigure it.
- **As a user paying monthly bills**, I want the due date of next month's instance to land on the same day of the month, even across month-length differences (e.g. 31st → 28th/30th).
- **As a user with a yearly renewal or review**, I want a once-a-year reminder that keeps recreating itself indefinitely without me having to remember to set it up again.
- **As a user whose routine changes**, I want to turn off recurrence on an existing todo without affecting instances that were already created.

## User Flow

1. User opens the todo form (create or edit) and checks **"Repeat"**.
2. A **recurrence pattern dropdown** appears: Daily / Weekly / Monthly / Yearly.
3. If no due date is set yet, the user is prompted to set one — **recurring todos require a due date**, since the pattern needs an anchor date to calculate the next occurrence from.
4. User saves the todo. It displays in the list with a **🔄 weekly** (or daily/monthly/yearly) badge next to the priority badge.
5. Time passes; the due date arrives (or passes, landing the todo in the Overdue section — recurrence does not affect section placement).
6. User clicks the checkbox to mark the todo **complete**.
7. The server marks the current instance `completed = true` and, in the same request, **creates a new todo** with:
   - the same `title`, `priority`, `is_recurring`, `recurrence_pattern`, `reminder_minutes`, and tag associations,
   - a `due_date` computed by applying the recurrence pattern to the completed instance's `due_date`.
8. The new instance appears in the list (Pending or Overdue, depending on its computed due date) with `completed = false`, ready to repeat the cycle.
9. At any point, the user can open Edit and uncheck "Repeat" to stop future recurrence on that specific chain — this does not delete or alter any instance already created.

## Technical Requirements

### Database Schema

Two columns on the existing `todos` table (defined in PRP 01):

```sql
-- todos table (relevant columns only — see PRP 01 for full schema)
is_recurring        INTEGER NOT NULL DEFAULT 0,   -- 0 | 1 (boolean)
recurrence_pattern  TEXT                          -- 'daily' | 'weekly' | 'monthly' | 'yearly', NULL when is_recurring = 0
```

No new tables. No foreign key to "previous instance" is stored — occurrences are linked only implicitly (same title/priority/tags/pattern), not via a parent/chain ID, matching the current data model.

### Types (`lib/db.ts`)

```typescript
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Todo {
  // ...other fields (see PRP 01)
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
}
```

### Validation

- If `is_recurring === true`, `recurrence_pattern` MUST be one of the four valid values, and `due_date` MUST be present (non-null). Reject with `400` otherwise:
  ```typescript
  if (is_recurring && !due_date) {
    return NextResponse.json(
      { error: 'Recurring todos require a due date' },
      { status: 400 }
    );
  }
  if (is_recurring && !['daily', 'weekly', 'monthly', 'yearly'].includes(recurrence_pattern)) {
    return NextResponse.json({ error: 'Invalid recurrence pattern' }, { status: 400 });
  }
  ```

### Due Date Calculation

All arithmetic operates on the Singapore-local representation of `due_date` (via `lib/timezone.ts`), preserving time-of-day, and applies month/year-end clamping since SQLite/JS date arithmetic does not do this automatically.

```typescript
// lib/recurrence.ts
import { toSingaporeParts, fromSingaporeParts } from './timezone';
import type { RecurrencePattern } from './db';

function daysInMonth(year: number, month1to12: number): number {
  // month1to12: 1-12
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

export function calculateNextDueDate(currentDueDate: string, pattern: RecurrencePattern): string {
  const { year, month, day, hour, minute } = toSingaporeParts(currentDueDate); // month: 1-12

  switch (pattern) {
    case 'daily': {
      return fromSingaporeParts(addDays({ year, month, day }, 1), hour, minute);
    }
    case 'weekly': {
      return fromSingaporeParts(addDays({ year, month, day }, 7), hour, minute);
    }
    case 'monthly': {
      const targetMonth = month === 12 ? 1 : month + 1;
      const targetYear = month === 12 ? year + 1 : year;
      const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));
      return fromSingaporeParts({ year: targetYear, month: targetMonth, day: clampedDay }, hour, minute);
    }
    case 'yearly': {
      const targetYear = year + 1;
      // Feb 29 -> Feb 28 when target year is not a leap year
      const clampedDay = Math.min(day, daysInMonth(targetYear, month));
      return fromSingaporeParts({ year: targetYear, month, day: clampedDay }, hour, minute);
    }
  }
}
```

Rules encoded above:
- **daily**: `due_date + 1 day`.
- **weekly**: `due_date + 7 days`.
- **monthly**: same day-of-month in the following month; if that day doesn't exist (e.g. Jan 31 → Feb), clamp to the last valid day of the target month (Feb 28 or 29).
- **yearly**: same month/day in the following year; Feb 29 clamps to Feb 28 when the target year is not a leap year.
- Time-of-day (`hour`, `minute`) is always preserved from the original `due_date`.

### API Endpoints

No new endpoints — this feature extends two existing ones from PRP 01:

| Method | Path | Change |
|---|---|---|
| `POST` | `/api/todos` | Accepts `is_recurring`, `recurrence_pattern`; validates due-date requirement |
| `PUT` | `/api/todos/[id]` | When `completed` transitions `false → true` on a recurring todo, also inserts the next instance |

`app/api/todos/[id]/route.ts`:

```typescript
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const existing = todoDB.findById(Number(id), session.userId);
  if (!existing) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  const updated = todoDB.update(Number(id), session.userId, body);

  const justCompleted = body.completed === true && existing.completed === false;
  if (justCompleted && existing.is_recurring && existing.recurrence_pattern && existing.due_date) {
    const nextDueDate = calculateNextDueDate(existing.due_date, existing.recurrence_pattern);

    const nextInstance = todoDB.create(session.userId, {
      title: existing.title,
      priority: existing.priority,
      is_recurring: true,
      recurrence_pattern: existing.recurrence_pattern,
      reminder_minutes: existing.reminder_minutes ?? null,
      due_date: nextDueDate,
    });

    const tagIds = tagDB.getTagIdsForTodo(existing.id);
    if (tagIds.length > 0) {
      tagDB.setTodoTags(nextInstance.id, tagIds);
    }

    return NextResponse.json({ todo: updated, nextInstance });
  }

  return NextResponse.json({ todo: updated });
}
```

The next-instance insert and tag copy run inside the same request as the completion update so the client sees both changes in one response and can render the new instance immediately.

## UI Components

Repeat checkbox + pattern dropdown in the todo form (shown for both create and edit):

```tsx
function RecurrenceFields({
  isRecurring,
  pattern,
  hasDueDate,
  onToggle,
  onPatternChange,
}: {
  isRecurring: boolean;
  pattern: RecurrencePattern;
  hasDueDate: boolean;
  onToggle: (checked: boolean) => void;
  onPatternChange: (pattern: RecurrencePattern) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={isRecurring}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={!hasDueDate}
        />
        Repeat
      </label>
      {isRecurring && (
        <select
          value={pattern}
          onChange={(e) => onPatternChange(e.target.value as RecurrencePattern)}
          className="rounded border px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      )}
      {!hasDueDate && (
        <span className="text-xs text-gray-500">Set a due date to enable repeat</span>
      )}
    </div>
  );
}
```

Recurrence badge, shown inline with the priority badge on each todo row:

```tsx
function RecurrenceBadge({ pattern }: { pattern: RecurrencePattern }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium
                 bg-purple-100 text-purple-800 border-purple-300
                 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-700"
    >
      🔄 {pattern}
    </span>
  );
}
```

## Edge Cases

- **Completing a recurring todo with no `due_date`** — should be unreachable because creation validation requires a due date whenever `is_recurring` is true, but the PUT handler must still guard (`if (existing.due_date)`) before calling `calculateNextDueDate`, since a todo could theoretically have had recurrence toggled on via a partial update that bypassed validation.
- **Month-end rollover** — Jan 31 (monthly) → Feb 28 (or 29 in a leap year), not Mar 3 (JS's native `Date` rolls over rather than clamping — the implementation must explicitly clamp, not rely on `setMonth`/`setDate` overflow behavior).
- **Leap-year rollover** — Feb 29 (yearly) → Feb 28 in the next (non-leap) year.
- **Disabling recurrence mid-stream** — unchecking "Repeat" on an existing todo sets `is_recurring = false` and does not touch any previously created next instance; that instance keeps whatever `is_recurring`/`recurrence_pattern` it was created with.
- **Deleting a recurring todo before it's completed** — simply deletes that instance; since instances are only spawned on completion (no pre-scheduled future rows), deletion silently ends that recurrence chain with no orphaned data.
- **Rapid double completion (double-click / duplicate request)** — the handler must only spawn a next instance when the transition is `false → true` (`existing.completed === false && body.completed === true`); a second PUT on an already-completed todo is a no-op with respect to next-instance creation, preventing duplicate instances from a double-submit.
- **Editing priority/tags/reminder on a recurring todo, then completing it** — the next instance inherits whatever the *current* values are at completion time, not the values from when it was first created.
- **Recurrence pattern changed on the current instance right before completing it** — the next instance uses the pattern in effect at completion time (last write wins).

## Acceptance Criteria

- [ ] Creating a todo with `is_recurring: true` and no `due_date` is rejected with a 400 and clear error message.
- [ ] Creating a todo with `is_recurring: true` and an invalid `recurrence_pattern` value is rejected with a 400.
- [ ] All four patterns (`daily`, `weekly`, `monthly`, `yearly`) are selectable and persist correctly.
- [ ] Completing a recurring todo creates exactly one new todo instance.
- [ ] The new instance has `completed = false`.
- [ ] The new instance's `due_date` is computed correctly for each pattern, including month-end and leap-year clamping.
- [ ] The new instance inherits `title`, `priority`, `recurrence_pattern`, `reminder_minutes`, and all tag associations from the completed instance.
- [ ] The 🔄 badge with pattern name renders on recurring todos in both light and dark mode.
- [ ] Unchecking "Repeat" on an existing todo stops future recurrence without affecting already-created instances.
- [ ] Double-submitting a completion request does not create duplicate next instances.
- [ ] Deleting a recurring todo does not create orphaned rows or affect other instances.

## Testing Requirements

**E2E** (`tests/05-recurring-todos.spec.ts`, using `tests/helpers.ts` — `createTodo()` etc.):

- [ ] Create a daily recurring todo with a due date; verify the 🔄 daily badge is visible.
- [ ] Create a weekly recurring todo; complete it; verify a new instance appears with `due_date` = original + 7 days.
- [ ] Create a monthly recurring todo due Jan 31; complete it; verify the next instance is due Feb 28 (or 29 in a leap year).
- [ ] Create a yearly recurring todo due Feb 29 (leap year); complete it; verify the next instance is due Feb 28 the following year.
- [ ] Complete a recurring todo that has tags and a reminder set; verify the next instance has the same tags and reminder badge.
- [ ] Attempt to create a recurring todo without a due date via the UI; verify the form blocks submission or the API returns a validation error.
- [ ] Edit an existing recurring todo, uncheck "Repeat", save; verify the 🔄 badge disappears and completing it no longer spawns a next instance.

**Unit tests** (`calculateNextDueDate`):

- [ ] `daily`: `2025-11-10T14:00` → `2025-11-11T14:00`.
- [ ] `weekly`: `2025-11-10T14:00` → `2025-11-17T14:00`.
- [ ] `monthly`, no overflow: `2025-06-15T09:00` → `2025-07-15T09:00`.
- [ ] `monthly`, overflow: `2025-01-31T09:00` → `2025-02-28T09:00`.
- [ ] `monthly`, leap-year overflow: `2024-01-31T09:00` → `2024-02-29T09:00`.
- [ ] `monthly`, December → January year rollover: `2025-12-31T09:00` → `2026-01-31T09:00`.
- [ ] `yearly`, no overflow: `2025-06-15T09:00` → `2026-06-15T09:00`.
- [ ] `yearly`, leap-day overflow: `2024-02-29T09:00` → `2025-02-28T09:00`.
- [ ] Time-of-day is preserved unchanged across all patterns.
- [ ] PUT handler: completing a non-recurring todo does not call `calculateNextDueDate` or insert any new row.
- [ ] PUT handler: completing an already-completed recurring todo a second time does not insert a duplicate next instance.

## Out of Scope

- Custom/arbitrary recurrence rules (e.g. "every 2 weeks", specific weekdays, nth-weekday-of-month, RRULE/iCal-style recurrence expressions).
- Recurrence end dates or a maximum occurrence count — recurrence continues indefinitely as long as the user keeps completing instances.
- Skipping or snoozing a single occurrence without breaking the chain.
- Pre-generating/scheduling future occurrences before the current one is completed (no background job).
- A "recurrence history" or chain view linking all past instances of a recurring todo together.

## Success Metrics

- 100% accuracy of `calculateNextDueDate` across the full pattern × edge-case matrix in the unit test suite (no manual date-math bugs).
- Next-instance creation adds no more than ~50ms of latency to the completion `PUT /api/todos/[id]` request (single additional insert + tag copy, no extra round trips).
- Zero duplicate next-instances observed under repeated/rapid completion toggling in E2E testing.
- 100% of recurring todos created in E2E tests display the correct 🔄 pattern badge in both light and dark mode.
