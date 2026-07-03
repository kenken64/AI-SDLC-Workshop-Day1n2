# PRP 05 — Subtasks & Progress Tracking

## Feature Overview

Each todo can have unlimited subtasks forming a checklist. Progress is tracked visually with a progress bar showing completion percentage. Subtasks maintain position order. Deleting a parent todo cascades to delete all subtasks. Subtask titles are included in search results.

---

## User Stories

| Persona | Story | Acceptance Criteria |
|---------|-------|---------------------|
| Project manager | As a user, I want to break a todo into subtasks so I can track smaller steps | Subtasks visible under parent todo |
| Visual thinker | As a user, I want a progress bar showing % complete so I can see advancement at a glance | Blue progress bar updates in real time |
| Focused worker | As a user, I want to collapse subtasks when I don't need to see them | ▶/▼ toggle hides/shows subtask list |
| Cleanup manager | As a user, I want subtasks to be deleted when I delete the parent todo | CASCADE delete behaviour |
| Searcher | As a user, I want search to find todos via subtask content | Subtask titles matched in search |

---

## User Flow

### Adding Subtasks
1. User clicks **▶ Subtasks** button on any todo
2. Subtask list expands with an input field at the bottom
3. User types subtask title and presses **Enter** or clicks **Add**
4. Subtask appears in list; progress bar updates

### Completing a Subtask
1. User clicks checkbox next to subtask
2. Subtask title shows strikethrough; progress bar advances
3. Progress text updates: "X/Y subtasks"

### Deleting a Subtask
1. User clicks ✕ on the right side of a subtask row
2. Subtask removed immediately; progress recalculates

### Collapsing
1. User clicks **▼ Subtasks** — list hides, progress bar remains visible

---

## Technical Requirements

### Database Schema (`lib/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,   -- 0 | 1
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### TypeScript Interfaces

```typescript
export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: number;   // 0 | 1
  position: number;
  created_at: string;
}

export interface CreateSubtaskInput {
  todoId: number;
  title: string;
}
```

### DB Operations

```typescript
export const subtaskDB = {
  findByTodoId(todoId: number): Subtask[] {
    return db.prepare(
      'SELECT * FROM subtasks WHERE todo_id = ? ORDER BY position, created_at'
    ).all(todoId) as Subtask[];
  },

  create(input: CreateSubtaskInput): Subtask {
    const maxPos = db.prepare(
      'SELECT COALESCE(MAX(position), 0) as m FROM subtasks WHERE todo_id = ?'
    ).get(input.todoId) as { m: number };
    const result = db.prepare(
      'INSERT INTO subtasks (todo_id, title, position) VALUES (?, ?, ?)'
    ).run(input.todoId, input.title, (maxPos.m + 1));
    return db.prepare('SELECT * FROM subtasks WHERE id = ?').get(result.lastInsertRowid) as Subtask;
  },

  update(id: number, completed: boolean): Subtask | undefined {
    db.prepare('UPDATE subtasks SET completed = ? WHERE id = ?').run(completed ? 1 : 0, id);
    return db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id) as Subtask | undefined;
  },

  delete(id: number): boolean {
    return db.prepare('DELETE FROM subtasks WHERE id = ?').run(id).changes > 0;
  },
};
```

### API Endpoints

#### `GET /api/todos/[id]/subtasks`
- Returns `Subtask[]` for the todo (ownership checked via parent todo)

#### `POST /api/todos/[id]/subtasks`
Request: `{ "title": "string (required)" }`
Response: `201 Subtask` | `400` | `401` | `404`

#### `PUT /api/todos/[id]/subtasks/[subtaskId]`
Request: `{ "completed": boolean }`
Response: `200 Subtask` | `400` | `401` | `404`

#### `DELETE /api/todos/[id]/subtasks/[subtaskId]`
Response: `{ success: true }` | `401` | `404`

### Todo Response with Subtasks

When fetching todos (`GET /api/todos`), include subtask summary:

```typescript
// Extended Todo type returned by API
interface TodoWithSubtasks extends Todo {
  subtasks: Subtask[];
  subtask_count: number;
  subtask_completed: number;
}
```

Either join in the SQL query or batch-fetch subtasks and attach:

```typescript
const todos = todoDB.findByUserId(userId);
const subtasks = subtaskDB.findByUserTodos(userId); // all subtasks for user's todos

return todos.map(todo => ({
  ...todo,
  subtasks: subtasks.filter(s => s.todo_id === todo.id),
}));
```

---

## UI Components

### Progress Bar

```tsx
function ProgressBar({ completed, total }: { completed: number; total: number }) {
  if (total === 0) return null;
  const pct = Math.round((completed / total) * 100);
  return (
    <div className="mt-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
          <div
            className="bg-blue-500 h-1.5 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
          {completed}/{total} subtasks
        </span>
      </div>
    </div>
  );
}
```

### Subtask Row

```tsx
function SubtaskRow({
  subtask,
  onToggle,
  onDelete,
}: {
  subtask: Subtask;
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <input
        type="checkbox"
        checked={!!subtask.completed}
        onChange={() => onToggle(subtask.id, !subtask.completed)}
        className="w-3.5 h-3.5 accent-blue-500"
      />
      <span className={`flex-1 text-sm ${subtask.completed ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
        {subtask.title}
      </span>
      <button
        onClick={() => onDelete(subtask.id)}
        className="text-gray-400 hover:text-red-500 text-xs px-1"
      >
        ✕
      </button>
    </div>
  );
}
```

### Expand/Collapse Toggle

```tsx
<button
  onClick={() => setExpanded(e => !e)}
  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
>
  {expanded ? '▼ Subtasks' : '▶ Subtasks'}
</button>
```

### Add Subtask Input

```tsx
{expanded && (
  <div className="mt-2 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
    {subtasks.map(s => (
      <SubtaskRow key={s.id} subtask={s} onToggle={handleToggle} onDelete={handleDelete} />
    ))}
    <div className="flex gap-2 mt-2">
      <input
        type="text"
        value={newSubtask}
        onChange={e => setNewSubtask(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleAddSubtask()}
        placeholder="Add subtask…"
        className="flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <button onClick={handleAddSubtask} className="text-sm bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600">
        Add
      </button>
    </div>
  </div>
)}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Empty subtask title | Reject with `400 { error: 'Title is required' }` |
| Deleting parent todo | All subtasks deleted via `ON DELETE CASCADE` |
| Subtask belonging to another user's todo | `404` (ownership check via parent todo) |
| Todo with no subtasks | Progress bar not rendered; Subtasks button still visible |
| All subtasks completed | Progress bar shows 100%, green tint optional |
| Uncompleting all subtasks | Progress bar returns to 0% |
| Search query matches subtask title | Parent todo is included in results |

---

## Acceptance Criteria

- [ ] ▶ Subtasks button visible on every todo
- [ ] Clicking it expands subtask list and add-subtask input
- [ ] Adding subtask via Enter key works
- [ ] Progress bar appears when at least one subtask exists
- [ ] Progress bar shows correct percentage (completed/total)
- [ ] "X/Y subtasks" text shows accurate count
- [ ] Checking a subtask increments progress bar
- [ ] Unchecking a subtask decrements progress bar
- [ ] Deleting a subtask recalculates progress
- [ ] Clicking ▼ Subtasks collapses the list (progress bar stays)
- [ ] Parent todo deletion cascades to delete all subtasks
- [ ] Search finds todos via subtask content

---

## Testing Requirements

### E2E Tests (`tests/06-subtasks.spec.ts`)

```typescript
test('add and complete subtask updates progress bar', async ({ page }) => {
  await helpers.createTodo(page, { title: 'Big project' });
  await helpers.addSubtask(page, 'Big project', 'Step 1');
  await helpers.addSubtask(page, 'Big project', 'Step 2');

  await expect(page.getByText('0/2 subtasks')).toBeVisible();

  await page.getByLabel('Step 1').check();
  await expect(page.getByText('1/2 subtasks')).toBeVisible();
});

test('deleting subtask removes it from list', async ({ page }) => {
  await helpers.createTodo(page, { title: 'Task' });
  await helpers.addSubtask(page, 'Task', 'Remove me');
  await page.getByText('Remove me').locator('..').getByText('✕').click();
  await expect(page.getByText('Remove me')).not.toBeVisible();
});

test('progress bar visible when subtasks exist', async ({ page }) => {
  await helpers.createTodo(page, { title: 'Parent' });
  await helpers.addSubtask(page, 'Parent', 'Sub A');
  await expect(page.getByRole('progressbar')).toBeVisible();
});
```

---

## Out of Scope

- Subtask due dates
- Subtask priorities
- Nested subtasks (sub-subtasks)
- Drag-and-drop reordering of subtasks
- Subtask notes/descriptions

---

## Success Metrics

- Progress bar accurate to 1% in all scenarios
- Subtask operations complete in < 300ms (p95)
- CASCADE delete leaves no orphaned subtask rows
