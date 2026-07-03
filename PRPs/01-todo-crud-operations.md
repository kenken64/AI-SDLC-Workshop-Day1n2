# PRP 01 — Todo CRUD Operations

## Feature Overview

The Todo CRUD system is the foundation of the app. It allows authenticated users to create, read, update, and delete personal todo items. All operations are scoped to the authenticated user via `session.userId`. All dates use Singapore timezone (`Asia/Singapore`).

---

## User Stories

| Persona | Story | Acceptance Criteria |
|---------|-------|---------------------|
| Busy professional | As a user, I want to quickly add a todo by typing a title and pressing Enter | Todo appears in Pending section immediately |
| Organised planner | As a user, I want to set a due date so I know when tasks are due | Due date shown with smart relative label |
| Task manager | As a user, I want to edit a todo's title or due date after creation | Edit modal pre-fills current values and updates on save |
| User clearing tasks | As a user, I want to mark a todo complete so I can track progress | Checked todo moves to Completed section |
| User removing tasks | As a user, I want to delete a todo I no longer need | Todo removed immediately, no undo |

---

## User Flow

### Creating a Todo
1. User types title in the main input field
2. Optionally selects priority and due date
3. Clicks **Add** (or presses Enter)
4. Todo appears in Pending section, sorted by priority → due date → created_at

### Editing a Todo
1. User clicks **Edit** on any todo
2. Modal opens with all current field values pre-filled
3. User modifies fields and clicks **Update**
4. Modal closes; todo updates in-place in the list

### Completing a Todo
1. User clicks the checkbox on the left of any todo
2. Optimistic update: todo immediately moves to Completed section
3. API call confirms; on failure, todo reverts

### Deleting a Todo
1. User clicks **Delete** on any todo
2. Todo removed immediately (no confirmation dialog)
3. API call confirms; on failure, list refreshed

---

## Technical Requirements

### Database Schema (`lib/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,        -- 0 | 1
  priority TEXT NOT NULL DEFAULT 'medium',     -- 'high' | 'medium' | 'low'
  due_date TEXT,                               -- ISO string "YYYY-MM-DDTHH:mm", Singapore time
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern TEXT,
  reminder_minutes INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);
```

### TypeScript Interfaces

```typescript
// lib/db.ts
export type Priority = 'high' | 'medium' | 'low';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: number;           // 0 | 1
  priority: Priority;
  due_date: string | null;
  is_recurring: number;        // 0 | 1
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CreateTodoInput {
  userId: number;
  title: string;
  priority?: Priority;
  due_date?: string | null;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
}

export interface UpdateTodoInput {
  title?: string;
  priority?: Priority;
  due_date?: string | null;
  completed?: boolean;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
}
```

### DB Operations (`lib/db.ts` — `todoDB` export)

```typescript
export const todoDB = {
  findByUserId(userId: number): Todo[],    // sorted: priority → due_date → created_at
  findById(id: number): Todo | undefined,
  create(input: CreateTodoInput): Todo,
  update(id: number, input: UpdateTodoInput): Todo | undefined,
  delete(id: number): boolean,
};
```

**Sort order SQL:**
```sql
ORDER BY
  CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
  due_date ASC NULLS LAST,
  created_at DESC
```

### API Endpoints

#### `GET /api/todos`
- Auth required (401 if missing)
- Returns array of `Todo[]` for `session.userId`, sorted

#### `POST /api/todos`
Request body:
```json
{
  "title": "string (required, non-empty)",
  "priority": "high | medium | low (default: medium)",
  "due_date": "YYYY-MM-DDTHH:mm | null",
  "is_recurring": false,
  "recurrence_pattern": null,
  "reminder_minutes": null
}
```
Responses: `201 Todo` | `400 { error }` | `401`

#### `PUT /api/todos/[id]`
- Validates ownership: `todo.user_id === session.userId`
- Partial update — only provided fields change
- Sets `completed_at` when `completed: true`; clears when `completed: false`
- Creates next recurring instance when completing a recurring todo
- Returns updated `Todo`

#### `DELETE /api/todos/[id]`
- Validates ownership
- Returns `{ success: true }`

### Validation Rules

| Field | Rule |
|-------|------|
| `title` | Required, non-empty after `.trim()`, max 500 chars |
| `due_date` | Must be at least 1 minute in the future (Singapore time) |
| `priority` | Must be `'high'`, `'medium'`, or `'low'` |
| `is_recurring` | Requires `due_date` to be set |
| `recurrence_pattern` | Required when `is_recurring: true` |

### Timezone Handling

```typescript
import { getSingaporeNow } from '@/lib/timezone';

// Validate future due date
const dueDate = new Date(due_date);
const now = getSingaporeNow();
if (dueDate <= now) {
  return NextResponse.json({ error: 'Due date must be in the future' }, { status: 400 });
}
```

---

## UI Components

### Todo Form (in `app/page.tsx`)

```tsx
// Input field
<input
  type="text"
  value={newTitle}
  onChange={e => setNewTitle(e.target.value)}
  onKeyDown={e => e.key === 'Enter' && handleAdd()}
  placeholder="What needs to be done?"
/>

// Date picker — min is 1 minute from now
<input
  type="datetime-local"
  value={newDueDate}
  min={getNowPlusMins(1)}
  onChange={e => setNewDueDate(e.target.value)}
/>
```

### Todo List Sections

Three collapsible sections rendered in order:

1. **Overdue** — red background, ⚠️ icon — `todo.due_date && isSingaporePast(todo.due_date) && !todo.completed`
2. **Pending** — default — `!todo.completed && !(overdue condition)`
3. **Completed** — `!!todo.completed`

### Edit Modal

- Opens on **Edit** button click
- Overlay click closes modal (no save)
- Fields: title, priority dropdown, datetime-local, recurring checkbox + pattern select
- Buttons: **Update** (blue) | **Cancel** (gray)

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Title is only whitespace | Reject with `400 { error: 'Title is required' }` |
| Due date in the past | Reject with `400 { error: 'Due date must be in the future' }` |
| Editing another user's todo | `404 Not found` (ownership check) |
| Completing recurring todo | Creates next instance; see PRP-03 |
| Network failure on toggle | Optimistic update reverts to original state |
| Empty todo list | Show "No todos yet. Add your first one above!" |

---

## Acceptance Criteria

- [ ] User can create a todo with title only (priority defaults to medium)
- [ ] User can create a todo with all optional fields filled
- [ ] Empty or whitespace-only title is rejected with clear error message
- [ ] Due date in the past is rejected with clear error message
- [ ] New todo appears in Pending section immediately (optimistic or instant)
- [ ] Todos are sorted: High priority first, then by due date, then by creation
- [ ] User can toggle a todo complete → moves to Completed section
- [ ] User can toggle a completed todo incomplete → moves back to correct section
- [ ] Edit modal pre-fills all current values
- [ ] Edit modal saves changes and updates the todo in-place
- [ ] Deleting a todo removes it from the list immediately
- [ ] Cannot edit or delete another user's todo (ownership enforced)
- [ ] API returns 401 for all endpoints when not authenticated

---

## Testing Requirements

### E2E Tests (`tests/02-todo-crud.spec.ts`)

```typescript
test('create todo with title only', async ({ page }) => {
  await helpers.createTodo(page, { title: 'Buy groceries' });
  await expect(page.getByText('Buy groceries')).toBeVisible();
});

test('create todo with due date', async ({ page }) => {
  const futureDate = /* Singapore time + 1 day */;
  await helpers.createTodo(page, { title: 'Meeting', dueDate: futureDate });
  await expect(page.getByText('Meeting')).toBeVisible();
});

test('reject empty title', async ({ page }) => {
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Title is required')).toBeVisible();
});

test('complete todo moves to Completed section', async ({ page }) => {
  await helpers.createTodo(page, { title: 'Task A' });
  await page.getByLabel('Task A').check();
  await expect(page.getByText('Completed (1)')).toBeVisible();
});

test('delete todo removes it from list', async ({ page }) => {
  await helpers.createTodo(page, { title: 'Temp task' });
  await page.getByRole('button', { name: 'Delete' }).first().click();
  await expect(page.getByText('Temp task')).not.toBeVisible();
});

test('edit todo updates title', async ({ page }) => {
  await helpers.createTodo(page, { title: 'Old title' });
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.getByLabel('Title').fill('New title');
  await page.getByRole('button', { name: 'Update' }).click();
  await expect(page.getByText('New title')).toBeVisible();
});
```

---

## Out of Scope

- Bulk operations (select all, bulk delete)
- Drag-and-drop reordering
- Undo delete
- Confirmation dialog before delete
- Todo archiving (separate from completion)
- Comments or attachments on todos

---

## Success Metrics

- Todo creation completes in < 500ms (p95)
- Zero data loss on concurrent edits (last-write-wins acceptable)
- All 401 cases covered — no unauthenticated data access
- 100% of CRUD operations validated against `session.userId`
