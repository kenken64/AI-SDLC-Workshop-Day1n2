# Subtasks & Progress Tracking

**Dependencies:** Adds a new `subtasks` table that CASCADE-deletes with its parent `todo` (see [PRP 01 — Todo CRUD Operations](./01-todo-crud-operations.md)). The subtask pattern (`title` + `position`) is reused by the [Template System (PRP 07)](./07-template-system.md) via JSON serialization, and subtask titles are included in [Search (PRP 08)](./08-search-filtering.md).

[← PRP Index](./README.md)

---

## Feature Overview

Subtasks let a user break a single todo into an ordered checklist of smaller steps. Each subtask has its own independent completion state, and the parent todo displays a real-time progress bar and `X/Y subtasks` counter summarizing checklist completion. Subtasks do not affect the parent todo's own `completed` flag — completing all subtasks does not auto-complete the todo, and completing the todo does not auto-complete its subtasks.

This feature turns the todo list from a flat task list into a lightweight project-management tool: multi-step projects, meeting agendas, shopping lists, recipe steps, and onboarding checklists all become a single todo with a visible completion percentage.

## User Stories

- **As a user preparing a presentation**, I want to add subtasks like "Create slides" and "Rehearse speech" to a single "Prepare presentation" todo, so I can track granular progress without cluttering my main todo list.
- **As a user with a recurring grocery run**, I want a checklist of items under one todo, so I can check items off as I shop and see how much is left at a glance.
- **As a user scanning my todo list**, I want to see a progress bar and "3/7 subtasks" text on a todo even when its checklist is collapsed, so I don't have to expand every todo to gauge progress.
- **As a user who over-planned a task**, I want to delete a subtask that's no longer relevant, so my checklist stays accurate.
- **As a user who deletes a todo**, I want all of its subtasks removed automatically, so I never end up with orphaned checklist items.

## User Flow

1. User locates a todo in any section (Overdue, Pending, Completed) and clicks **"▶ Subtasks"** to expand it.
2. The button toggles to **"▼ Subtasks"**; an add-subtask input field and the existing subtask list appear beneath the todo.
3. User types a subtask title and presses **Enter** (or clicks **"Add"**). The subtask is appended to the end of the list (`position = current max + 1`).
4. Each subtask row shows a checkbox (left), the title (center), and a **"✕"** delete button (right).
5. User clicks a checkbox to mark a subtask complete/incomplete. The progress bar and `X/Y subtasks` text update immediately, without a full page reload.
6. User clicks **"✕"** to permanently delete a subtask; it is removed from the list and the progress bar recalculates.
7. User clicks **"▼ Subtasks"** to collapse the list again. The progress bar and count text remain visible on the collapsed todo row.
8. If the user deletes the parent todo, all of its subtasks are removed automatically (cascade) with no separate confirmation step.

## Technical Requirements

### Database Schema

This PRP owns the `subtasks` table:

```sql
CREATE TABLE subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_subtasks_todo_id ON subtasks(todo_id);
```

> **Gotcha:** `better-sqlite3` does not enforce `ON DELETE CASCADE` unless foreign keys are turned on explicitly. Run `db.pragma('foreign_keys = ON')` once when the database connection is initialized in `lib/db.ts`. If this pragma is ever omitted, deleting a todo will silently leave orphaned `subtasks` rows — cascade delete must then be handled manually inside a transaction (`db.transaction(...)`) that deletes subtasks before the parent todo. Prefer the pragma; treat the manual-transaction path as a fallback only.

### Types (`lib/db.ts`)

```typescript
export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
}

export interface CreateSubtaskDto {
  title: string;
}

export interface UpdateSubtaskDto {
  title?: string;
  completed?: boolean;
}
```

`subtaskDB` in `lib/db.ts` exposes:

```typescript
export const subtaskDB = {
  findByTodoId(todoId: number): Subtask[] { /* ORDER BY position ASC */ },
  create(todoId: number, data: CreateSubtaskDto): Subtask { /* position = MAX(position)+1 */ },
  update(id: number, data: UpdateSubtaskDto): Subtask,
  delete(id: number): void,
};
```

### API Endpoints

**`POST /api/todos/[id]/subtasks`** — create a subtask under todo `id`.

```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params; // parent todo id
  const { title } = await request.json();

  if (!title || !title.trim()) {
    return NextResponse.json({ error: 'Subtask title is required' }, { status: 400 });
  }

  const todo = todoDB.findById(Number(id));
  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  const subtask = subtaskDB.create(Number(id), { title: title.trim() });
  return NextResponse.json(subtask, { status: 201 });
}
```

**`PUT /api/subtasks/[id]`** — toggle completion and/or rename a subtask.

```typescript
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const body = await request.json(); // { completed?: boolean; title?: string }

  // Ownership check traverses subtask -> todo -> user_id before allowing the update.
  const updated = subtaskDB.update(Number(id), body);
  return NextResponse.json(updated);
}
```

**`DELETE /api/subtasks/[id]`** — permanently remove a subtask (no confirmation, mirrors todo delete behavior).

```typescript
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  subtaskDB.delete(Number(id));
  return NextResponse.json({ success: true });
}
```

All three routes verify `session.userId` matches the owning todo's `user_id` (via a join or a lookup) before mutating — subtask IDs are not scoped to a user directly since ownership is inherited from the parent todo.

**Position on delete:** deleting a subtask does **not** renumber the remaining rows' `position` values (no compaction pass). Ordering only needs `ORDER BY position ASC` to be stable; gaps in the sequence are harmless. This keeps deletes O(1) instead of O(n).

### Progress Calculation (pure function, shared by API and UI)

```typescript
export function calculateProgress(subtasks: Subtask[]): {
  completed: number;
  total: number;
  percent: number;
} {
  const total = subtasks.length;
  const completed = subtasks.filter((s) => s.completed).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percent };
}
```

## UI Components

```tsx
function ProgressBar({ completed, total, percent }: { completed: number; total: number; percent: number }) {
  if (total === 0) return null; // no subtasks: bar is hidden entirely, not shown at 0%

  const barColor = percent === 100 ? 'bg-green-500' : 'bg-blue-500';

  return (
    <div className="mt-1">
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
        <span>{completed}/{total} subtasks</span>
        <span>{percent}%</span>
      </div>
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-200`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function SubtaskList({ todoId, subtasks, onChange }: {
  todoId: number;
  subtasks: Subtask[];
  onChange: () => void; // re-fetch/re-render parent todo after any mutation
}) {
  const [expanded, setExpanded] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const { completed, total, percent } = calculateProgress(subtasks);

  const addSubtask = async () => {
    const title = newTitle.trim();
    if (!title) return;
    await fetch(`/api/todos/${todoId}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    setNewTitle('');
    onChange();
  };

  const toggleSubtask = async (subtask: Subtask) => {
    await fetch(`/api/subtasks/${subtask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !subtask.completed }),
    });
    onChange();
  };

  const deleteSubtask = async (id: number) => {
    await fetch(`/api/subtasks/${id}`, { method: 'DELETE' });
    onChange();
  };

  return (
    <div>
      <button onClick={() => setExpanded(!expanded)} className="text-sm text-gray-500 dark:text-gray-400">
        {expanded ? '▼' : '▶'} Subtasks
      </button>

      <ProgressBar completed={completed} total={total} percent={percent} />

      {expanded && (
        <div className="mt-2 space-y-1 pl-4">
          {subtasks.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={s.completed}
                onChange={() => toggleSubtask(s)}
              />
              <span className={s.completed ? 'line-through text-gray-400' : ''}>{s.title}</span>
              <button onClick={() => deleteSubtask(s.id)} className="ml-auto text-red-500">✕</button>
            </div>
          ))}
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
              placeholder="Add subtask..."
              className="flex-1 border rounded px-2 py-1 text-sm dark:bg-gray-700"
            />
            <button onClick={addSubtask} className="text-sm text-blue-600">Add</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

## Edge Cases

- **Zero subtasks**: `ProgressBar` renders `null` — no bar, no `0/0 subtasks` text. The "▶ Subtasks" toggle is still shown so the user can add the first one.
- **Deleting the last incomplete subtask**: the bar recalculates to 100% and turns green immediately, even though the user's intent was removal, not completion — this is expected and matches the pure `calculateProgress` semantics (percent is only ever a function of the remaining rows).
- **Deleting the parent todo while subtasks are expanded**: the row unmounts; no dangling fetches should be made for subtask children after the todo is gone. No separate confirmation is shown for the cascade (matches PRP 01's no-confirmation delete behavior).
- **Very long subtask lists**: no hard cap is specified — the checklist can grow unbounded. Consider virtualization or a "show more" affordance only if a todo exceeds ~50 subtasks in practice; not required for v1.
- **Rapid double-toggle / race condition**: two fast clicks on the same checkbox before the first `PUT` resolves could send conflicting `completed` values. The UI should optimistically update local state immediately and reconcile with the server response; the last request to resolve wins server-side.
- **Empty or whitespace-only subtask title**: rejected client-side (`.trim()` check before enabling submit) and server-side (400 response), mirroring todo title validation in PRP 01.
- **Subtask on a todo owned by another user**: `POST/PUT/DELETE` must 404, not 403, to avoid leaking existence of another user's todo IDs.

## Acceptance Criteria

- [ ] Can add unlimited subtasks to any todo
- [ ] Subtask checkbox toggles completion independently of the parent todo's `completed` flag
- [ ] Progress bar and `X/Y subtasks` text update immediately after add/toggle/delete
- [ ] Progress bar is blue below 100% and green at exactly 100%
- [ ] Progress bar and count are visible when the subtask list is collapsed
- [ ] Progress bar is not rendered at all when a todo has zero subtasks
- [ ] Deleting a subtask removes only that row and does not affect sibling positions
- [ ] Deleting the parent todo cascade-deletes all of its subtasks (no orphaned rows)
- [ ] Empty/whitespace subtask titles are rejected client- and server-side
- [ ] Subtask titles are searchable (see PRP 08)
- [ ] A user cannot add/edit/delete subtasks on another user's todo (404, not 403)

## Testing Requirements

**E2E (Playwright)** — `tests/07-subtasks.spec.ts`, using the `addSubtask()` helper from `tests/helpers.ts`:

- [ ] Expand subtasks section on a todo with none yet
- [ ] Add a single subtask via Enter key
- [ ] Add multiple subtasks via the "Add" button
- [ ] Toggle a subtask complete → progress bar and text update, bar stays blue below 100%
- [ ] Complete all subtasks → progress bar turns green at 100%
- [ ] Delete a subtask → count and percentage recalculate correctly
- [ ] Collapse the subtask list → progress bar and `X/Y subtasks` text remain visible
- [ ] Delete the parent todo → subtasks no longer appear anywhere (verify via API or re-expand attempt fails)
- [ ] Submitting an empty/whitespace subtask title shows no new row and no request succeeds

**Unit tests** — `calculateProgress()`:

- [ ] `calculateProgress([])` → `{ completed: 0, total: 0, percent: 0 }`
- [ ] All subtasks incomplete → `percent: 0`
- [ ] Partial completion, e.g. 3 of 7 → `{ completed: 3, total: 7, percent: 43 }` (rounded)
- [ ] All subtasks complete → `{ completed: N, total: N, percent: 100 }`
- [ ] Rounding behaves predictably for non-integer percentages (e.g. 1/3 → 33%, 2/3 → 67%)

**Integration tests** (API routes):

- [ ] `POST /api/todos/[id]/subtasks` assigns `position` as `max(position) + 1` for that todo
- [ ] `DELETE /api/subtasks/[id]` does not renumber remaining subtasks' positions
- [ ] Deleting a todo via `DELETE /api/todos/[id]` removes all of its `subtasks` rows (requires `PRAGMA foreign_keys = ON` to be active in the test DB connection)
- [ ] Cross-user subtask mutation attempts return 404

## Out of Scope

- Nested subtasks / sub-subtasks (single-level checklist only)
- Subtask-level due dates, priorities, assignees, or reminders
- Drag-and-drop manual reordering (the `position` column exists and is respected on read, but no reorder UI is specified — flagged as future work)
- Auto-completing the parent todo when all subtasks are checked (explicitly independent per USER_GUIDE.md)
- Auto-completing all subtasks when the parent todo is marked complete

## Success Metrics

- Progress bar and count reflect a toggle/add/delete within one render cycle (no manual refresh required)
- Zero orphaned `subtasks` rows exist after any todo deletion, verified via `SELECT COUNT(*) FROM subtasks WHERE todo_id NOT IN (SELECT id FROM todos)` returning 0
- Subtask CRUD API responses return in under 300ms (matches project-wide API performance target)
- `calculateProgress` unit test suite passes at 100% including boundary cases (0 subtasks, 100% complete)
