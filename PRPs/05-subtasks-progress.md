# PRP 05: Subtasks & Progress Tracking

## Feature Overview

Allow users to add ordered subtasks (checklist items) to any todo. Display a visual progress bar based on subtask completion. Subtasks are deleted automatically when their parent todo is deleted (CASCADE).

## User Stories

- As a user, I can add multiple subtasks to a todo to break it into smaller steps.
- As a user, I can toggle individual subtasks as complete or incomplete.
- As a user, I can see a progress bar showing how many subtasks are done.
- As a user, I can reorder subtasks by position.
- As a user, I can delete individual subtasks.
- As a user, when I delete a todo, all its subtasks are removed automatically.

## User Flow

1. User opens a todo's detail/edit view.
2. User types a subtask title and clicks "Add Subtask".
3. Subtask appears in the checklist at the next position.
4. User checks/unchecks subtasks; progress bar updates in real time.
5. User can delete a subtask via a remove button.
6. Deleting the parent todo removes all subtasks automatically.

## Technical Requirements

### Database

Create a `subtasks` table:

```sql
CREATE TABLE IF NOT EXISTS subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
);
```

Enable foreign keys: `db.pragma('foreign_keys = ON');`

### Types

```typescript
export type Subtask = {
  id: number;
  todo_id: number;
  title: string;
  completed: 0 | 1;
  position: number;
  created_at: string;
};

type SubtaskInput = {
  title: string;
  position?: number;
};
```

### API Endpoints

- `GET /api/todos/:id/subtasks`
  - Return all subtasks for a todo ordered by `position ASC`.
  - Response: `{ data: Subtask[] }`.
- `POST /api/todos/:id/subtasks`
  - Body: `{ title: string }`
  - Auto-assign `position` as max existing position + 1 (or 0 if first).
  - Validation: `title` required, <= 200 chars.
  - Response: `{ data: Subtask }` with status `201`.
- `PUT /api/todos/:id/subtasks/:subtaskId`
  - Body: `{ title?: string, completed?: boolean, position?: number }`
  - Validation: `title` <= 200 chars when provided; `completed` must be boolean; `position` must be non-negative integer.
  - Response: `{ data: Subtask }`.
- `DELETE /api/todos/:id/subtasks/:subtaskId`
  - Response: `{ success: true }`.

### Database Operations (lib/db.ts)

Export a `subtaskDB` object:

```typescript
export const subtaskDB = {
  listByTodo(todoId: number): Subtask[] { ... },
  create(todoId: number, input: SubtaskInput, nowIso: string): Subtask { ... },
  update(id: number, input: Partial<SubtaskInput & { completed: boolean }>): Subtask | undefined { ... },
  delete(id: number): boolean { ... },
};
```

### Progress Calculation

Progress is computed client-side:

```typescript
const total = subtasks.length;
const done = subtasks.filter(s => s.completed).length;
const percent = total === 0 ? 0 : Math.round((done / total) * 100);
```

### Recurring Todo Behavior

When a recurring todo is completed and the next instance is created:
- Subtasks are **not** copied to the next instance (next instance starts fresh).
- The completed todo retains its subtasks as-is.

## UI Requirements

- Expandable subtask section within each todo card.
- Input field + "Add" button to create subtasks inline.
- Checkbox for each subtask to toggle completion.
- Delete button (×) on each subtask row.
- Progress bar showing `done / total` with percentage.
- Progress bar color: gray at 0 %, blue in progress, green at 100 %.
- Subtasks ordered by `position`.

## Edge Cases

- Adding a subtask to a non-existent todo returns `404`.
- Updating/deleting a subtask that doesn't exist returns `404`.
- Updating a subtask that belongs to a different todo than the URL param returns `404`.
- Deleting a parent todo cascades and removes all subtasks.
- Empty subtask title returns `400`.
- Subtask `title` over 200 chars returns `400`.

## Acceptance Criteria

- Subtasks can be created, toggled, and deleted.
- Progress bar accurately reflects subtask completion ratio.
- Subtask ordering is preserved via `position` field.
- Deleting a todo removes all its subtasks (CASCADE).
- Validation enforces title presence and length.
- API returns `404` for operations on non-existent todos or subtasks.

## Out of Scope

- Drag-and-drop reordering UI
- Nested subtasks (subtasks of subtasks)
- Subtask due dates or assignees
- Bulk subtask operations

## Testing Guidance

- Create a todo, add 3 subtasks, verify they appear in order.
- Toggle subtasks and verify progress bar updates (`0/3`, `1/3`, `3/3`).
- Delete a subtask and verify progress recalculates.
- Delete the parent todo and verify subtasks are cascade-deleted.
- Attempt to create a subtask with empty title — verify `400` response.
- Attempt to create a subtask on a non-existent todo — verify `404` response.
