# Priority System

Three-level priority system (High/Medium/Low) for todos, with color-coded badges and automatic priority-based sorting.

**Dependencies:** This PRP extends the `todos` table and CRUD API defined in [PRP 01 — Todo CRUD Operations](./01-todo-crud-operations.md). Read that PRP first; the `priority` column and base `Todo` interface are owned there. This PRP only adds constraints, sorting behavior, and UI on top.

[← PRP Index](./README.md)

---

## Feature Overview

Every todo has a `priority` of `high`, `medium`, or `low`. Priority drives:

1. A color-coded badge shown inline on every todo card (Overdue, Pending, and Completed sections).
2. Automatic sort ordering within each section (High → Medium → Low, then by due date, then by creation date).
3. A "Priority" filter dropdown that narrows the visible list to a single level.

Priority has no default UI toggle for "no priority" — every todo has exactly one of the three levels at all times, defaulting to `medium` if unspecified at creation.

## User Stories

- **As a user with many todos**, I want high-priority items to always float to the top of each section, so I don't have to manually reorder my list to see what's urgent.
- **As a user scanning my list quickly**, I want a color badge (red/yellow/blue) on each todo, so I can triage visually without reading every title.
- **As a user planning my day**, I want to filter to only High priority todos, so I can focus on what matters most right now.
- **As a user reviewing "someday" tasks**, I want to filter to Low priority todos, so I can batch-review them without noise from urgent items.

## User Flow

1. **Creating a todo**: User opens the todo form → selects a priority from the dropdown (`High` / `Medium` / `Low`, defaulting to `Medium`) → submits. The new todo is inserted into its section already in the correct sorted position.
2. **Editing priority**: User clicks "Edit" on an existing todo → changes the priority dropdown → clicks "Update" → the todo re-sorts within its current section (Overdue/Pending/Completed) immediately.
3. **Filtering by priority**: User opens the "All Priorities" dropdown in the filter bar → selects `High Priority` → the list re-renders showing only high-priority todos across all sections → user selects `All Priorities` again to clear.
4. **Scanning results**: In every section, the user sees badges ordered 🔴 (High) items first, then 🟡 (Medium), then 🔵 (Low); within the same priority, earlier due dates appear first.

## Technical Requirements

### Database Schema

The `priority` column lives on the `todos` table (defined fully in PRP 01). This PRP owns only this column's contract:

```sql
-- Column on todos table (see PRP 01 for full table definition)
priority TEXT NOT NULL DEFAULT 'medium'  -- 'high' | 'medium' | 'low'
```

No new tables or columns are introduced by this feature.

### Types (`lib/db.ts`)

```typescript
export type Priority = 'high' | 'medium' | 'low';

export const PRIORITY_VALUES: Priority[] = ['high', 'medium', 'low'];

export const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};
```

### Validation

Applied in `POST /api/todos` and `PUT /api/todos/[id]` before the row is written:

```typescript
function validatePriority(value: unknown): Priority {
  if (value === undefined || value === null) return 'medium';
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  throw new Error(`Invalid priority: ${String(value)}. Must be 'high', 'medium', or 'low'.`);
}
```

- Omitted `priority` on create → defaults to `'medium'`.
- Invalid enum value (e.g. `'urgent'`, `''`, `null` explicitly passed on update) → API responds `400` with `{ error: "Invalid priority: urgent. Must be 'high', 'medium', or 'low'." }`.
- `priority` is never nullable in the database — the API layer is the only place `null`/`undefined` is tolerated (and only to trigger the default).

### API Endpoints

No new endpoints. Existing endpoints from PRP 01 gain priority-related behavior:

| Endpoint | Change |
|---|---|
| `POST /api/todos` | Accepts optional `priority` field; validates via `validatePriority`; defaults to `'medium'`. |
| `PUT /api/todos/[id]` | Accepts optional `priority` field for update; validates via `validatePriority`; rejects invalid values with `400`. |
| `GET /api/todos?priority=high` | New optional query param. When present, filters results to that single priority server-side is NOT required — filtering is implemented client-side in `app/page.tsx` for combination with other filters (see [PRP 08](./08-search-filtering.md)). The query param is supported for direct API consumers but the main UI does not rely on it. |

Route handler pattern (per project convention):

```typescript
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await params; // params is a Promise in Next.js 16

  const body = await request.json();
  let priority: Priority;
  try {
    priority = validatePriority(body.priority);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const updated = todoDB.update(Number(id), session.userId, { priority, /* ...other fields */ });
  if (!updated) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  return NextResponse.json(updated);
}
```

### Sorting Logic

Sorting is a pure function applied client-side (and may also be applied server-side in `todoDB.findAll`) after fetching todos, independently within each section (Overdue / Pending / Completed):

```typescript
function compareTodos(a: Todo, b: Todo): number {
  // 1. Priority: High → Medium → Low
  const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (priorityDiff !== 0) return priorityDiff;

  // 2. Due date: earliest first; todos with no due date sort after todos with one
  if (a.due_date && b.due_date) {
    const dueDiff = new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    if (dueDiff !== 0) return dueDiff;
  } else if (a.due_date && !b.due_date) {
    return -1;
  } else if (!a.due_date && b.due_date) {
    return 1;
  }

  // 3. Creation date: newest first (tiebreaker)
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort(compareTodos); // never mutate the input array
}
```

**Worked example** (sort result for a mixed set):

```
1. High priority,   due today
2. High priority,   due tomorrow
3. Medium priority,  due today
4. Medium priority,  due next week
5. Low priority,     due tomorrow
6. Low priority,     no due date
```

Completed section uses a different comparator (completion date, newest first) — see PRP 01; priority is not part of Completed section ordering.

## UI Components

### `PriorityBadge`

```tsx
type PriorityBadgeProps = {
  priority: Priority;
};

const PRIORITY_STYLES: Record<Priority, string> = {
  high:   'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700',
  low:    'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700',
};

const PRIORITY_LABELS: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${PRIORITY_STYLES[priority]}`}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
```

### Priority `<select>` (create/edit form)

```tsx
<select
  value={priority}
  onChange={(e) => setPriority(e.target.value as Priority)}
  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
             dark:bg-gray-700 dark:border-gray-600 dark:text-white"
>
  <option value="high">High</option>
  <option value="medium">Medium</option>
  <option value="low">Low</option>
</select>
```

### Priority filter dropdown

```tsx
<select
  value={priorityFilter}
  onChange={(e) => setPriorityFilter(e.target.value as Priority | 'all')}
  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
             dark:bg-gray-700 dark:border-gray-600 dark:text-white"
>
  <option value="all">All Priorities</option>
  <option value="high">High Priority</option>
  <option value="medium">Medium Priority</option>
  <option value="low">Low Priority</option>
</select>
```

Both accent colors (light and dark) must resolve to the app's shared palette: Blue `#3B82F6`/`#60A5FA`, Red `#EF4444`/`#F87171`, Yellow `#F59E0B`/`#FBBF24` (light/dark respectively).

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| `priority` omitted on `POST /api/todos` | Defaults to `medium`; no error. |
| `priority: null` explicitly sent on update | Treated as "no change requested" → defaults to `medium` only if this is a create; on update, reject with `400` if the caller intends to clear it, since the column is `NOT NULL`. |
| Invalid string (e.g. `"urgent"`, `"HIGH"` uppercase) | `400 Bad Request`; enum matching is case-sensitive lowercase only. |
| Editing priority while list is filtered by a different priority | Todo disappears from the current filtered view immediately (it no longer matches the active filter) rather than lingering until refresh. |
| Two todos with identical priority, due date, and `created_at` (bulk import) | Order is stable but unspecified beyond the three sort keys — acceptable, not a bug. |
| Priority filter combined with search/tag/date filters | Priority filter is applied as one AND condition among all active filters — see [PRP 08](./08-search-filtering.md) for combination order. |
| Recurring todo completion creates next instance | Next instance inherits the same `priority` as the completed instance (see [PRP 03](./03-recurring-todos.md)). |
| Todo with no due date vs. todo with a due date, same priority | No-due-date todo sorts **after** the one with a due date (rule 2 in the comparator). |

## Acceptance Criteria

- [ ] Todo can be created with `priority` = `high`, `medium`, or `low`.
- [ ] Omitting `priority` on create defaults to `medium`.
- [ ] Invalid `priority` value on create or update returns `400` with a descriptive error and does not write to the database.
- [ ] Priority badge renders with correct color (red/yellow/blue) and label on every todo card, in all three sections.
- [ ] Badge colors meet WCAG AA contrast in both light and dark mode.
- [ ] Todos within the Overdue and Pending sections are sorted High → Medium → Low.
- [ ] Within the same priority, todos are sorted by due date ascending (earliest first), with no-due-date todos last.
- [ ] Within the same priority and due date, todos are sorted by creation date descending (newest first).
- [ ] Editing a todo's priority immediately re-sorts it into the correct position within its section.
- [ ] Priority filter dropdown, when set to a specific level, shows only todos of that priority.
- [ ] Priority filter set to "All Priorities" shows all todos regardless of priority.
- [ ] Priority filter combines correctly (AND logic) with search, tag, completion, and date-range filters.

## Testing Requirements

Test file: `tests/03-priority.spec.ts` (uses `tests/helpers.ts`, notably `createTodo()` with a `priority` option).

**E2E Tests (Playwright):**
- [ ] Create a todo with each of the three priority levels; assert the correct badge color/label appears.
- [ ] Create a todo without specifying priority; assert it defaults to Medium.
- [ ] Edit a todo's priority from Low to High; assert it moves above existing Medium/Low todos in the same section.
- [ ] Set the priority filter to "High Priority"; assert only high-priority todos are visible.
- [ ] Clear the priority filter ("All Priorities"); assert all todos reappear.
- [ ] Create three todos (High/Medium/Low, same due date); assert they render in High→Medium→Low order.
- [ ] Visual/snapshot check: badge colors are visually distinct in both light and dark mode (via `prefers-color-scheme` emulation).

**Unit Tests:**
- [ ] `validatePriority` accepts `'high'`/`'medium'`/`'low'`, defaults `undefined`/`null` to `'medium'`, throws on anything else.
- [ ] `compareTodos` / `sortTodos`: given a mixed array, produces the exact worked-example ordering above.
- [ ] `sortTodos` does not mutate its input array (returns a new array).
- [ ] Tie-breaking: two todos with identical priority and due date sort by `created_at` descending.

**API Integration Tests:**
- [ ] `POST /api/todos` with invalid `priority` returns `400` and does not create a row.
- [ ] `PUT /api/todos/[id]` with invalid `priority` returns `400` and leaves the existing row unchanged.

## Out of Scope

- Custom or user-defined priority levels beyond High/Medium/Low.
- Per-priority notification/reminder behavior (e.g. auto-reminders for High priority) — belongs to [PRP 04 — Reminders & Notifications](./04-reminders-notifications.md).
- Priority-based automation or escalation (e.g. auto-promoting Medium → High as due date approaches).
- Numeric/custom priority scoring (e.g. 1–100 scale) — the app uses a fixed 3-level enum only.
- Bulk priority reassignment UI (select multiple todos, change priority at once).

## Success Metrics

- Sorting a list of 500 todos completes in under 50ms client-side (pure function, no re-fetch).
- 100% of priority badges pass WCAG AA contrast checks (4.5:1 for text) in both light and dark mode, verified via automated Lighthouse/axe audit.
- Zero invalid-priority rows possible in the database (enforced entirely at the API validation layer, verified via integration tests attempting to bypass the UI).
- In usability review, users correctly identify the "most urgent" todo in a mixed-priority list by badge color alone in under 2 seconds (informal UX check, not automated).
