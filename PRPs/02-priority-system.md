# PRP 02 — Priority System

## Feature Overview

Todos have three priority levels — **High**, **Medium**, and **Low** — each visually distinct via color-coded badges. Todos are automatically sorted with high-priority items first. Users can filter the list by priority. Priority defaults to `medium` on creation.

---

## User Stories

| Persona | Story | Acceptance Criteria |
|---------|-------|---------------------|
| Overwhelmed worker | As a user, I want to mark urgent tasks as High priority so they surface at the top | High priority todos appear before medium and low |
| Planner | As a user, I want color-coded priority badges so I can scan urgency at a glance | Red = High, Yellow = Medium, Blue = Low badges visible on each todo |
| Focused worker | As a user, I want to filter by priority so I can focus only on high-priority items | Filter dropdown shows only matching todos |
| Task creator | As a user, I want priority to default to Medium so I don't have to set it every time | New todos created without selecting priority default to medium |

---

## User Flow

### Setting Priority on Creation
1. User fills in todo title
2. Selects priority from dropdown (High / Medium / Low) — defaults to Medium
3. Creates todo → priority badge visible on the todo item

### Changing Priority
1. User clicks **Edit** on any todo
2. Changes priority in the dropdown
3. Clicks **Update** → badge and sort order update immediately

### Filtering by Priority
1. User selects a priority from the **Priority** filter dropdown (above todo list)
2. Only todos matching that priority are shown across all sections (Overdue, Pending, Completed)
3. Selecting "All Priorities" clears the filter

---

## Technical Requirements

### Type Definition (`lib/db.ts`)

```typescript
export type Priority = 'high' | 'medium' | 'low';
```

### Database Column

```sql
priority TEXT NOT NULL DEFAULT 'medium'
-- Constraint: CHECK(priority IN ('high', 'medium', 'low'))
```

### Sort Order (applied in `todoDB.findByUserId`)

```sql
ORDER BY
  CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
  due_date ASC NULLS LAST,
  created_at DESC
```

### API Validation

```typescript
const VALID_PRIORITIES: Priority[] = ['high', 'medium', 'low'];
if (priority && !VALID_PRIORITIES.includes(priority)) {
  return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
}
```

### Default Value

```typescript
priority: (body.priority as Priority) ?? 'medium'
```

---

## UI Components

### Priority Badge

```tsx
const PRIORITY_COLORS: Record<Priority, string> = {
  high:   'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  low:    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORITY_COLORS[priority]}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}
```

### Priority Dropdown (Form & Edit Modal)

```tsx
<select
  value={priority}
  onChange={e => setPriority(e.target.value as Priority)}
  className="..."
>
  <option value="high">🔴 High</option>
  <option value="medium">🟡 Medium</option>
  <option value="low">🔵 Low</option>
</select>
```

### Priority Filter

```tsx
// State
const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');

// Filter logic
const filteredTodos = filterPriority === 'all'
  ? todos
  : todos.filter(t => t.priority === filterPriority);

// Dropdown
<select value={filterPriority} onChange={e => setFilterPriority(e.target.value as Priority | 'all')}>
  <option value="all">All Priorities</option>
  <option value="high">High Priority</option>
  <option value="medium">Medium Priority</option>
  <option value="low">Low Priority</option>
</select>
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Invalid priority value in API request | Return `400 { error: 'Invalid priority' }` |
| Priority not provided on creation | Default to `'medium'` |
| Priority filter + other filters | AND logic — all active filters must match |
| Dark mode | Each priority uses adjusted dark variants for readability |
| Priority change on recurring todo | Only current instance changes; next instance inherits completion-time priority |

---

## Acceptance Criteria

- [ ] New todos default to Medium priority if not specified
- [ ] All three priority levels display correct color badges (Red / Yellow / Blue)
- [ ] Dark mode shows adjusted badge colors with sufficient contrast
- [ ] Todo list sorts: High → Medium → Low within each section
- [ ] Todos with same priority sort by due date (earliest first)
- [ ] Priority filter "High Priority" shows only high-priority todos
- [ ] Priority filter "All Priorities" shows all todos
- [ ] Priority filter combines with search and tag filters (AND logic)
- [ ] Editing priority updates badge and re-sorts list
- [ ] Invalid priority value in API returns 400

---

## Testing Requirements

### E2E Tests (`tests/02-todo-crud.spec.ts` and `tests/03-priority.spec.ts`)

```typescript
test('todos sorted by priority: high first', async ({ page }) => {
  await helpers.createTodo(page, { title: 'Low task', priority: 'low' });
  await helpers.createTodo(page, { title: 'High task', priority: 'high' });
  await helpers.createTodo(page, { title: 'Medium task', priority: 'medium' });

  const items = await page.locator('[data-testid="todo-item"]').all();
  await expect(items[0]).toContainText('High task');
  await expect(items[1]).toContainText('Medium task');
  await expect(items[2]).toContainText('Low task');
});

test('priority badge shows correct color', async ({ page }) => {
  await helpers.createTodo(page, { title: 'Urgent', priority: 'high' });
  const badge = page.getByText('High');
  await expect(badge).toHaveClass(/text-red-700/);
});

test('priority filter shows only matching todos', async ({ page }) => {
  await helpers.createTodo(page, { title: 'High task', priority: 'high' });
  await helpers.createTodo(page, { title: 'Low task', priority: 'low' });
  await page.selectOption('[data-testid="priority-filter"]', 'high');
  await expect(page.getByText('High task')).toBeVisible();
  await expect(page.getByText('Low task')).not.toBeVisible();
});

test('default priority is medium', async ({ page }) => {
  await helpers.createTodo(page, { title: 'Default priority task' });
  await expect(page.getByText('Medium')).toBeVisible();
});
```

---

## Out of Scope

- Custom priority levels (more than 3)
- Priority icons (only text badges)
- Priority-based due date suggestions
- Bulk priority changes

---

## Success Metrics

- 100% of todos display a priority badge
- Sort order correct on every page load and after every update
- Filter response is instant (client-side, no API call)
