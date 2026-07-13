# Todo CRUD Operations

Core create, read, update, and delete functionality for todos, including Singapore-timezone-aware due dates, automatic section organization (Overdue/Pending/Completed), validation, and optimistic UI updates.

**Dependencies**: This is the foundational feature. The `todos` table defined here is extended by Priority System ([02](./02-priority-system.md)), Recurring Todos ([03](./03-recurring-todos.md)), Reminders & Notifications ([04](./04-reminders-notifications.md)), Subtasks & Progress ([05](./05-subtasks-progress.md)), and Tag System ([06](./06-tag-system.md)). Implement this PRP first.

[← PRP Index](./README.md)

---

## Feature Overview

Todos are the core entity of the application. A todo has a required title, an optional Singapore-timezone due date/time, and a completion state. Todos are always scoped to the authenticated user (`session.userId`), automatically sorted, and organized into three sections in the UI: **Overdue**, **Pending**, and **Completed**. All create/update/delete operations happen through REST-style Next.js API routes backed by `better-sqlite3`, with the client (`app/page.tsx`) applying optimistic UI updates for responsiveness.

## User Stories

- **As a user**, I want to quickly add a todo with just a title, so I can capture a task without friction.
- **As a user**, I want to optionally set a priority and due date when creating a todo, so I can plan my day.
- **As a user**, I want overdue todos clearly separated from upcoming ones, so I never miss a deadline.
- **As a user**, I want to edit any field of an existing todo, so I can correct mistakes or adjust plans.
- **As a user**, I want to mark a todo complete/incomplete with one click, so tracking progress is effortless.
- **As a user**, I want to delete a todo I no longer need, so my list stays relevant.
- **As a user**, I want the list to re-sort and re-section automatically when I change a due date or priority, so I don't have to manage it manually.

## User Flow

1. User lands on `/` (protected route — see [PRP 11](./11-authentication-webauthn.md)) and sees the todo form at the top of the page.
2. User types a title into the text input. Priority defaults to **Medium** in the dropdown. Due date/time picker is optional.
3. User clicks **"Add"** (or the form submit). Client validates the title is non-empty/non-whitespace and, if a due date was entered, that it is at least 1 minute in the future (Singapore time).
4. Client optimistically inserts the new todo into local state and section it belongs to, then `POST /api/todos`. On success, the temporary optimistic entry is reconciled with the server-returned `Todo` (real `id`, `created_at`). On failure, the optimistic entry is rolled back and an error is shown.
5. The todo list re-renders: **Overdue** section (red) shown first if any todos are past due and incomplete, then **Pending** (gray), then **Completed**. Each section header shows a live count, e.g. "Overdue (3)".
6. User clicks **"Edit"** on a todo → modal opens pre-filled with current values → user changes fields → clicks **"Update"** → `PUT /api/todos/[id]` → modal closes, list re-sorts/re-sections based on new values. Clicking **"Cancel"**, clicking outside the modal, or pressing Escape discards changes with no API call.
7. User clicks the checkbox → optimistic toggle of `completed` → `PUT /api/todos/[id]` with `{ completed: true }` → todo animates/moves into the **Completed** section. Unchecking a completed todo returns it to **Overdue** or **Pending** based on whether `due_date` is in the past.
8. User clicks **"Delete"** → todo is removed immediately from local state and `DELETE /api/todos/[id]` is called. No confirmation dialog. Cascade deletes remove associated subtasks and tag links server-side.

## Technical Requirements

### Database Schema

```sql
CREATE TABLE todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,                              -- ISO 8601, Singapore local time, nullable
  priority TEXT NOT NULL DEFAULT 'medium',    -- 'high' | 'medium' | 'low' (see PRP 02)
  is_recurring INTEGER NOT NULL DEFAULT 0,    -- see PRP 03
  recurrence_pattern TEXT,                    -- see PRP 03
  reminder_minutes INTEGER,                   -- see PRP 04
  last_notification_sent TEXT,                -- see PRP 04
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE INDEX idx_todos_user_id ON todos(user_id);
CREATE INDEX idx_todos_due_date ON todos(due_date);
```

`subtasks` (PRP 05) and `tags`/`todo_tags` (PRP 06) both declare `ON DELETE CASCADE` foreign keys back to `todos.id`, so deleting a todo removes its subtasks and tag associations automatically — no application-level cleanup code needed as long as SQLite foreign keys are enabled (`PRAGMA foreign_keys = ON` at connection init in `lib/db.ts`).

### Types (`lib/db.ts`)

```typescript
export type Priority = 'high' | 'medium' | 'low';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: boolean;
  due_date: string | null;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  updated_at: string | null;
  subtasks?: Subtask[];
  tags?: Tag[];
}

export interface CreateTodoInput {
  title: string;
  due_date?: string | null;
  priority?: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
  tag_ids?: number[];
}

export interface UpdateTodoInput extends Partial<CreateTodoInput> {
  completed?: boolean;
}
```

### API Endpoints

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/todos` | Create a todo for the authenticated user |
| `GET` | `/api/todos` | List all todos for the authenticated user (with subtasks/tags joined) |
| `GET` | `/api/todos/[id]` | Fetch a single todo (must belong to the authenticated user) |
| `PUT` | `/api/todos/[id]` | Update any subset of fields, including `completed` |
| `DELETE` | `/api/todos/[id]` | Delete a todo (cascades to subtasks/tags) |

```typescript
// app/api/todos/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const title = (body.title ?? '').trim();
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  if (body.due_date) {
    const due = new Date(body.due_date);
    const minDue = new Date(getSingaporeNow().getTime() + 60_000);
    if (due < minDue) {
      return NextResponse.json(
        { error: 'Due date must be at least 1 minute in the future' },
        { status: 400 }
      );
    }
  }

  const todo = todoDB.create({
    user_id: session.userId,
    title,
    due_date: body.due_date ?? null,
    priority: body.priority ?? 'medium',
    is_recurring: body.is_recurring ?? false,
    recurrence_pattern: body.recurrence_pattern ?? null,
    reminder_minutes: body.reminder_minutes ?? null,
    tag_ids: body.tag_ids ?? [],
  });

  return NextResponse.json(todo, { status: 201 });
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return NextResponse.json(todoDB.findAllByUser(session.userId));
}
```

```typescript
// app/api/todos/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const existing = todoDB.findById(Number(id));
  if (!existing || existing.user_id !== session.userId) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  const body = await request.json();
  if (body.title !== undefined && !body.title.trim()) {
    return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
  }

  const updated = todoDB.update(Number(id), {
    ...body,
    title: body.title !== undefined ? body.title.trim() : undefined,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const existing = todoDB.findById(Number(id));
  if (!existing || existing.user_id !== session.userId) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  todoDB.delete(Number(id)); // FK CASCADE removes subtasks + todo_tags rows
  return NextResponse.json({ success: true });
}
```

### Sorting & Sectioning Logic

```typescript
// lib/todoSort.ts (or inline in app/page.tsx)
const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    if (PRIORITY_ORDER[a.priority] !== PRIORITY_ORDER[b.priority]) {
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    }
    const aDue = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const bDue = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    if (aDue !== bDue) return aDue - bDue;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function sectionTodos(todos: Todo[], now: Date) {
  const incomplete = todos.filter((t) => !t.completed);
  const overdue = sortTodos(
    incomplete.filter((t) => t.due_date && new Date(t.due_date) < now)
  );
  const pending = sortTodos(
    incomplete.filter((t) => !t.due_date || new Date(t.due_date) >= now)
  );
  const completed = todos
    .filter((t) => t.completed)
    .sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime());
  return { overdue, pending, completed };
}
```

## UI Components

```tsx
// app/page.tsx (excerpt — 'use client')
'use client';

import { useState } from 'react';
import type { Todo } from '@/lib/db';

function TodoItem({
  todo,
  onToggle,
  onEdit,
  onDelete,
}: {
  todo: Todo;
  onToggle: (id: number, completed: boolean) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <li className="flex items-center justify-between rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={(e) => onToggle(todo.id, e.target.checked)}
          className="mt-1 h-5 w-5 rounded border-gray-300 dark:border-gray-600"
          aria-label={`Mark "${todo.title}" as ${todo.completed ? 'incomplete' : 'complete'}`}
        />
        <div>
          <p className="font-medium text-gray-800 dark:text-white">{todo.title}</p>
          {todo.due_date && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {formatDueDate(todo.due_date)}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-3 text-sm">
        <button onClick={() => onEdit(todo)} className="text-blue-600 dark:text-blue-400">
          Edit
        </button>
        <button onClick={() => onDelete(todo.id)} className="text-red-600 dark:text-red-400">
          Delete
        </button>
      </div>
    </li>
  );
}
```

```tsx
// Optimistic create (excerpt of the form submit handler in app/page.tsx)
async function handleAddTodo(input: CreateTodoInput) {
  const optimisticTodo: Todo = {
    id: -Date.now(), // temporary negative id, replaced on server response
    user_id: currentUserId,
    completed: false,
    created_at: new Date().toISOString(),
    updated_at: null,
    last_notification_sent: null,
    is_recurring: false,
    recurrence_pattern: null,
    reminder_minutes: null,
    priority: 'medium',
    due_date: null,
    ...input,
  };

  setTodos((prev) => [...prev, optimisticTodo]);

  try {
    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error('Failed to create todo');
    const saved: Todo = await res.json();
    setTodos((prev) => prev.map((t) => (t.id === optimisticTodo.id ? saved : t)));
  } catch (err) {
    setTodos((prev) => prev.filter((t) => t.id !== optimisticTodo.id));
    setError('Could not create todo. Please try again.');
  }
}
```

## Edge Cases

- **Empty/whitespace-only title**: rejected both client-side (submit button disabled/no-op) and server-side (`400 { error: 'Title is required' }`); `title.trim()` applied before persisting.
- **Due date exactly at the 1-minute boundary**: server recomputes "now" at request time (not client time) and compares `due_date >= getSingaporeNow() + 60s`; client clock skew must not bypass this.
- **Deleting a todo with subtasks and tags**: cascade delete must remove all `subtasks` rows and `todo_tags` rows in the same transaction; verify no orphaned rows remain.
- **Concurrent edits** (e.g. two tabs): last write wins via `updated_at` overwrite; no optimistic-locking/conflict detection is implemented — note this as a known limitation.
- **Very long titles**: no hard server-side max enforced by default; UI should visually truncate/wrap rather than break layout. Recommend a soft client-side warning above 200 characters.
- **Todo with no due date**: always lands in **Pending**, never **Overdue**, regardless of age.
- **Toggling completion on a todo with a past due date**: unchecking moves it back to **Overdue**, not **Pending**, since `due_date` is still in the past.
- **Todo belonging to another user**: `GET/PUT/DELETE /api/todos/[id]` must return `404` (not `403`) to avoid leaking existence of other users' todo IDs.
- **Malformed/missing `due_date` string**: server validates with `new Date(x)` and rejects `Invalid Date` with `400`.

## Acceptance Criteria

- [ ] Can create a todo with only a title (all other fields default: `priority=medium`, `completed=false`, `due_date=null`)
- [ ] Cannot create a todo with an empty or whitespace-only title (client and server both reject)
- [ ] Cannot create a todo with a due date less than 1 minute in the future (Singapore time)
- [ ] Todos are automatically split into Overdue / Pending / Completed sections with live counts
- [ ] Todos within Overdue and Pending are sorted by priority → due date → creation date (newest first for ties)
- [ ] Toggling the checkbox updates `completed` and immediately moves the todo to the correct section
- [ ] Editing a todo updates only the changed fields and re-sections/re-sorts the list
- [ ] Canceling an edit (Cancel button, outside click, or Escape) makes no API call and discards changes
- [ ] Deleting a todo removes it immediately with no confirmation dialog
- [ ] Deleting a todo cascades to its subtasks and tag associations (no orphaned rows)
- [ ] A user can never read, update, or delete another user's todo (`404` on cross-user access)
- [ ] UI updates optimistically and rolls back cleanly if the API call fails

## Testing Requirements

Test file: `tests/02-todo-crud.spec.ts` (uses `tests/helpers.ts` → `createTodo()`).

**E2E (Playwright)**
- [ ] Create todo with title only → appears in Pending section
- [ ] Create todo with title, priority, and future due date → correct section and badge
- [ ] Attempt to create todo with empty title → inline validation error, no API call
- [ ] Attempt to create todo with a past due date → error shown, todo not created
- [ ] Edit a todo's title and due date → list re-sorts/re-sections correctly
- [ ] Cancel an edit → original values unchanged
- [ ] Toggle completion on and off → todo moves between Completed and Overdue/Pending correctly
- [ ] Delete a todo → removed from DOM immediately, and `GET /api/todos` no longer returns it after reload
- [ ] Delete a todo with subtasks → subtasks also gone after reload (verifies cascade)

**Unit**
- [ ] `sortTodos()` orders by priority, then due date, then creation date correctly for mixed input
- [ ] `sectionTodos()` correctly buckets todos into overdue/pending/completed at the exact due-date boundary
- [ ] Server-side due-date validator rejects dates < 1 minute in the future and accepts dates ≥ 1 minute
- [ ] Title trimming/whitespace validation logic

**Integration**
- [ ] `POST /api/todos` without a valid session returns `401`
- [ ] `PUT/DELETE /api/todos/[id]` for a todo owned by another user returns `404`
- [ ] `POST /api/todos` persists all provided fields and returns them in the response body

## Out of Scope

- Priority level semantics, badge colors, and priority-based filtering — see [PRP 02](./02-priority-system.md)
- Recurrence pattern logic and next-instance creation — see [PRP 03](./03-recurring-todos.md)
- Reminder scheduling and browser notifications — see [PRP 04](./04-reminders-notifications.md)
- Subtask creation, checklist UI, and progress bars — see [PRP 05](./05-subtasks-progress.md)
- Tag assignment and tag-based filtering — see [PRP 06](./06-tag-system.md)
- Undo/trash/soft-delete for removed todos
- Bulk operations (multi-select complete/delete)
- Drag-and-drop manual reordering (sorting is always automatic)
- Real-time multi-device sync (e.g. WebSockets) — updates require a page action or reload

## Success Metrics

- `POST/PUT/DELETE /api/todos*` p95 response time < 300ms under normal load
- Zero orphaned `subtasks`/`todo_tags` rows after any todo deletion (verified via periodic integrity check)
- 0 reported cases of a user viewing/modifying another user's todo
- Optimistic UI reflects user action within one animation frame (< 16ms perceived latency) before network confirmation
- E2E suite (`tests/02-todo-crud.spec.ts`) passes consistently across 3 consecutive runs
