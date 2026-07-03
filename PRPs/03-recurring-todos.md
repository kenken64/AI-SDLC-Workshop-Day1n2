# PRP 03 — Recurring Todos

## Feature Overview

Recurring todos automatically create the next instance when the current one is marked complete. Supported patterns: **daily**, **weekly**, **monthly**, **yearly**. The new instance inherits all settings (title, priority, recurrence pattern, reminder) and has its due date advanced by the recurrence interval. A recurring todo **requires** a due date.

---

## User Stories

| Persona | Story | Acceptance Criteria |
|---------|-------|---------------------|
| Habit builder | As a user, I want to create a daily exercise todo that auto-renews so I don't have to recreate it every day | Completing the todo creates the next day's instance |
| Team lead | As a user, I want a weekly team meeting todo so I never miss setting it up | Completing it creates an instance 7 days later |
| Finance manager | As a user, I want a monthly bill payment reminder that recurs automatically | Next instance due same date next month |
| User viewing todos | As a user, I want to see which todos are recurring so I can distinguish them from one-offs | 🔄 badge with pattern name on each recurring todo |

---

## User Flow

### Creating a Recurring Todo
1. User enters title, sets priority, sets a **due date** (required)
2. Checks the **🔄 Repeat** checkbox
3. Selects pattern from dropdown: Daily / Weekly / Monthly / Yearly
4. Clicks **Add**
5. Todo shows 🔄 badge with pattern name

### Completing a Recurring Todo
1. User checks the todo's completion checkbox
2. Current instance is marked complete and moves to Completed section
3. A **new instance** is automatically created:
   - Same title, priority, recurrence settings
   - Due date advanced by the pattern interval
4. New instance appears in Pending section

### Disabling Recurrence (Edit)
1. User opens Edit modal on a recurring todo
2. Unchecks the **🔄 Repeat** checkbox
3. Saves — todo becomes a one-off; no next instance created on completion

---

## Technical Requirements

### Database Columns

```sql
-- On todos table
is_recurring INTEGER NOT NULL DEFAULT 0,    -- 0 | 1
recurrence_pattern TEXT,                     -- 'daily' | 'weekly' | 'monthly' | 'yearly' | NULL
```

### Type Definitions (`lib/db.ts`)

```typescript
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';
```

### Next Due Date Calculation (`lib/timezone.ts`)

```typescript
export function getNextRecurrenceDate(
  currentDue: string,
  pattern: RecurrencePattern
): string {
  switch (pattern) {
    case 'daily':   return addDaysToISO(currentDue, 1);
    case 'weekly':  return addDaysToISO(currentDue, 7);
    case 'monthly': return addMonthsToISO(currentDue, 1);
    case 'yearly':  return addYearsToISO(currentDue, 1);
  }
}

function addDaysToISO(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 16);
}

function addMonthsToISO(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 16);
}

function addYearsToISO(iso: string, years: number): string {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 16);
}
```

### Completion Logic (`app/api/todos/[id]/route.ts` — PUT handler)

```typescript
const wasCompleted = existing.completed === 0 && completed === true;
const isRecurring = (is_recurring !== undefined ? is_recurring : existing.is_recurring === 1);
const pattern = (recurrence_pattern ?? existing.recurrence_pattern) as RecurrencePattern | null;

// Update current instance
const updated = todoDB.update(todoId, { ...updateInput });

// Create next instance if completing a recurring todo
if (wasCompleted && isRecurring && pattern && existing.due_date) {
  const nextDueDate = getNextRecurrenceDate(existing.due_date, pattern);
  todoDB.create({
    userId: session.userId,
    title: existing.title,
    priority: existing.priority,
    due_date: nextDueDate,
    is_recurring: true,
    recurrence_pattern: pattern,
    reminder_minutes: existing.reminder_minutes ?? null,
  });
}
```

### Validation

```typescript
// Recurring requires a due date
if (is_recurring && !due_date) {
  return NextResponse.json(
    { error: 'Recurring todos require a due date' },
    { status: 400 }
  );
}

// Valid pattern
const VALID_PATTERNS: RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly'];
if (is_recurring && recurrence_pattern && !VALID_PATTERNS.includes(recurrence_pattern)) {
  return NextResponse.json({ error: 'Invalid recurrence pattern' }, { status: 400 });
}
```

---

## UI Components

### Recurrence Badge

```tsx
function RecurrenceBadge({ pattern }: { pattern: RecurrencePattern }) {
  const labels: Record<RecurrencePattern, string> = {
    daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly',
  };
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-300 dark:border-purple-700">
      🔄 {labels[pattern]}
    </span>
  );
}
```

### Recurrence Controls (Form & Edit Modal)

```tsx
{/* Repeat toggle */}
<label className="flex items-center gap-2 cursor-pointer text-sm">
  <input
    type="checkbox"
    checked={isRecurring}
    onChange={e => setIsRecurring(e.target.checked)}
    className="w-4 h-4 accent-purple-600"
  />
  🔄 Repeat
</label>

{/* Pattern selector — shown only when repeat is checked */}
{isRecurring && (
  <select
    value={pattern}
    onChange={e => setPattern(e.target.value as RecurrencePattern)}
  >
    <option value="daily">Daily</option>
    <option value="weekly">Weekly</option>
    <option value="monthly">Monthly</option>
    <option value="yearly">Yearly</option>
  </select>
)}
```

### Date Requirement Notice

When the recurring checkbox is checked and no due date is set, show an inline hint:

```tsx
{isRecurring && !dueDate && (
  <p className="text-amber-600 text-xs">⚠️ Recurring todos need a due date</p>
)}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Recurring todo checked without due date | Block form submission with error: "Recurring todos require a due date" |
| Monthly recurrence on Jan 31 → Feb | `setMonth()` behavior: rolls over (Feb 31 → Mar 3) — acceptable |
| Recurring todo with past due_date | Next instance calculated from stored due_date, not from "now" — preserves intended schedule |
| Deleting a recurring todo | Only current instance deleted; does NOT delete future instances (there are none yet) |
| Uncompleting a recurring todo | Does nothing special — no new instance; completed_at cleared |
| Invalid recurrence pattern in API | Return `400 { error: 'Invalid recurrence pattern' }` |
| Next instance due date already past | New instance created with past due_date → appears in Overdue section |

---

## Acceptance Criteria

- [ ] Recurring checkbox is visible on todo creation form
- [ ] Pattern dropdown (Daily/Weekly/Monthly/Yearly) shows only when recurring is checked
- [ ] Attempting to create recurring todo without due date is rejected
- [ ] Recurring todos show 🔄 badge with pattern name
- [ ] Completing a recurring todo creates a new instance with the next due date
- [ ] New instance inherits: title, priority, recurrence pattern, reminder minutes
- [ ] New instance appears in Pending (or Overdue) section
- [ ] Completing a non-recurring todo does NOT create a new instance
- [ ] Editing a recurring todo to disable recurrence makes next completion non-recurring
- [ ] API rejects invalid recurrence patterns with 400

---

## Testing Requirements

### E2E Tests (`tests/04-recurring.spec.ts`)

```typescript
test('completing daily recurring todo creates next instance', async ({ page }) => {
  const tomorrow = /* future date + 1 day */;
  await helpers.createTodo(page, {
    title: 'Daily standup',
    dueDate: tomorrow,
    isRecurring: true,
    pattern: 'daily',
  });

  await page.getByLabel('Daily standup').check(); // complete it

  // Original moves to completed
  await expect(page.getByText('Completed (1)')).toBeVisible();

  // New instance in pending
  const pendingItems = page.locator('[data-testid="pending-section"] [data-testid="todo-item"]');
  await expect(pendingItems.filter({ hasText: 'Daily standup' })).toHaveCount(1);
});

test('completing weekly todo advances due date by 7 days', async ({ page }) => {
  // Similar to above, verify new instance due date is +7 days
});

test('recurring badge is visible on recurring todos', async ({ page }) => {
  await helpers.createTodo(page, { title: 'Weekly review', isRecurring: true, pattern: 'weekly', dueDate: /* future */ });
  await expect(page.getByText('🔄 Weekly')).toBeVisible();
});

test('creating recurring todo without due date shows error', async ({ page }) => {
  await page.getByPlaceholder('What needs to be done?').fill('No date recurring');
  await page.getByLabel('Repeat').check();
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText(/due date/i)).toBeVisible();
});
```

---

## Out of Scope

- Custom recurrence intervals (e.g., every 3 days)
- Recurrence end date / max occurrences
- Skip occurrence (marking "skip this week")
- Calendar-aware recurrence (e.g., "last business day of month")
- Editing future instances of a recurring series

---

## Success Metrics

- Next instance created within the same API response as completion
- Pattern label always visible on recurring todos
- Zero phantom instances (only one new instance per completion)
