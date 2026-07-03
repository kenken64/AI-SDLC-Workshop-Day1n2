# PRP Implementation Progress

> Last updated: 2026-07-03  
> Branch: `zentilt-run-dev-server`  
> Commit: `64a7cd1`

---

## Overview

| PRP | Feature | Status | Completed |
|-----|---------|--------|-----------|
| [PRP 01](#prp-01--todo-crud-operations) | Todo CRUD Operations | ✅ Done | 2026-07-03 |
| [PRP 02](#prp-02--priority-system) | Priority System | ✅ Done | 2026-07-03 |
| [PRP 03](#prp-03--recurring-todos) | Recurring Todos | ✅ Done | 2026-07-03 |
| PRP 04 | Reminders & Notifications | ✅ Done | 2026-07-03 |
| PRP 05 | Subtasks & Progress | ✅ Done | 2026-07-03 |
| PRP 06 | Tag System | ✅ Done | 2026-07-03 |
| [PRP 07](#prp-07--template-system) | Template System | ⬜ Not started | — |
| PRP 08 | Search & Filtering | ⬜ Not started | — |
| PRP 09 | Export / Import | ⬜ Not started | — |
| PRP 10 | Calendar View | ⬜ Not started | — |
| ~~PRP 11~~ | ~~WebAuthn / Passkeys~~ | 🗑️ Removed | 2026-07-03 |

---

## PRP 01 — Todo CRUD Operations

**Status:** ✅ Complete  
**Spec file:** [`PRPs/01-todo-crud-operations.md`](./01-todo-crud-operations.md)

### What was implemented

#### Database (`lib/db.ts`)
- [x] `todos` table with all required columns: `id`, `user_id`, `title`, `completed`, `priority`, `due_date`, `is_recurring`, `recurrence_pattern`, `reminder_minutes`, `created_at`, `updated_at`, `completed_at`
- [x] Migration blocks for columns added after initial schema (safe to re-run)
- [x] `todoDB.findAll()` — returns all todos sorted by priority → due_date → created_at
- [x] `todoDB.findById(id)` — lookup by id
- [x] `todoDB.create(input)` — insert with all fields
- [x] `todoDB.update(id, input)` — partial update, sets `completed_at` correctly
- [x] `todoDB.delete(id)` — returns boolean

#### Sort order (enforced in DB query)
```sql
ORDER BY
  CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
  due_date ASC NULLS LAST,
  created_at DESC
```

#### API routes
- [x] `GET /api/todos` — returns sorted `Todo[]`
- [x] `POST /api/todos` — validates title (required, max 500 chars), due date (future), recurring rules; returns `201 Todo`
- [x] `PUT /api/todos/[id]` — partial update, ownership check, sets `completed_at`; creates next recurring instance on completion
- [x] `DELETE /api/todos/[id]` — ownership check, returns `{ success: true }`

#### Validation
- [x] Title required, non-empty after `.trim()`, max 500 chars
- [x] Due date must be in the future (Singapore time via `getSingaporeNow()`)
- [x] Recurring todo requires a due date
- [x] Invalid recurrence pattern returns `400`

#### UI (`app/page.tsx`)
- [x] Title input — Enter key submits
- [x] Datetime-local picker with `min` set to 1 minute from now
- [x] Three sections: **⚠️ Overdue** (red background), **Pending**, **Completed**
- [x] Edit modal — pre-fills all current values; overlay click cancels
- [x] **Update** (blue) / **Cancel** (gray) buttons in modal
- [x] Optimistic toggle — reverts to original state on API failure
- [x] Immediate delete (no confirmation)
- [x] Empty state: *"No todos yet. Add your first one above!"*
- [x] `data-testid="todo-item"` on each todo row
- [x] `aria-label={todo.title}` on checkboxes

### Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Create todo with title only (priority defaults to medium) | ✅ |
| Create todo with all optional fields | ✅ |
| Whitespace-only title rejected | ✅ |
| Due date in the past rejected | ✅ |
| New todo appears in Pending immediately | ✅ |
| Todos sorted: High → Medium → Low | ✅ |
| Toggle complete → moves to Completed section | ✅ |
| Toggle back → moves to correct section | ✅ |
| Edit modal pre-fills all values | ✅ |
| Edit saves and updates in-place | ✅ |
| Delete removes todo immediately | ✅ |

---

## PRP 02 — Priority System

**Status:** ✅ Complete  
**Spec file:** [`PRPs/02-priority-system.md`](./02-priority-system.md)

### What was implemented

#### Database
- [x] `priority TEXT NOT NULL DEFAULT 'medium'` column on `todos`
- [x] `Priority` type exported from `lib/db.ts`: `'high' | 'medium' | 'low'`
- [x] Validation in API: rejects unknown priority values with `400`

#### UI (`app/page.tsx`)

**Priority Badge component:**
```tsx
const PRIORITY_COLORS: Record<Priority, string> = {
  high:   'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  low:    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};
```

- [x] Red badge for High, Yellow for Medium, Blue for Low
- [x] Dark mode variants on all three badges
- [x] Priority dropdown in **Add Todo** form (🔴 High / 🟡 Medium / 🔵 Low)
- [x] Priority dropdown in **Edit Modal**
- [x] Defaults to `medium` when not selected
- [x] **Priority filter dropdown** above the todo list
  - Options: All Priorities / High Priority / Medium Priority / Low Priority
  - Client-side filtering — instant, no API call
  - `data-testid="priority-filter"` for E2E tests
- [x] Filter applies across all sections (Overdue, Pending, Completed)

### Acceptance criteria

| Criterion | Status |
|-----------|--------|
| New todos default to Medium if unspecified | ✅ |
| Correct color badges for all three levels | ✅ |
| Dark mode badge colors with sufficient contrast | ✅ |
| Sorted High → Medium → Low within sections | ✅ |
| Same priority sorts by due date (earliest first) | ✅ |
| Filter "High Priority" shows only high todos | ✅ |
| Filter "All Priorities" shows all todos | ✅ |
| Editing priority updates badge immediately | ✅ |
| Invalid priority in API returns 400 | ✅ |

---

## PRP 03 — Recurring Todos

**Status:** ✅ Complete  
**Spec file:** [`PRPs/03-recurring-todos.md`](./03-recurring-todos.md)

### What was implemented

#### Database
- [x] `is_recurring INTEGER NOT NULL DEFAULT 0`
- [x] `recurrence_pattern TEXT` — `'daily' | 'weekly' | 'monthly' | 'yearly'`
- [x] `RecurrencePattern` type exported from `lib/db.ts`

#### Timezone utility (`lib/timezone.ts`)
- [x] `getNextRecurrenceDate(currentDue, pattern)` — advances due date by interval:
  - `daily` → +1 day
  - `weekly` → +7 days
  - `monthly` → +1 month (`setMonth`)
  - `yearly` → +1 year (`setFullYear`)

#### Completion logic (`app/api/todos/[id]/route.ts` — PUT)
```
wasCompleted = existing.completed === 0 && completed === true
isRecurring  = is_recurring ?? existing.is_recurring === 1
pattern      = recurrence_pattern ?? existing.recurrence_pattern

if (wasCompleted && isRecurring && pattern && existing.due_date):
  nextDue = getNextRecurrenceDate(existing.due_date, pattern)
  todoDB.create({ title, priority, due_date: nextDue, is_recurring: true,
                  recurrence_pattern: pattern, reminder_minutes })
```

- [x] New instance inherits: title, priority, recurrence pattern, reminder_minutes
- [x] New instance appears in Pending (or Overdue if past due)
- [x] Only **one** new instance created per completion

#### UI (`app/page.tsx`)
- [x] **🔄 Repeat** checkbox in Add form
- [x] Pattern dropdown (Daily / Weekly / Monthly / Yearly) — shown only when checked
- [x] **⚠️ Recurring todos need a due date** warning when recurring is checked but no due date is set
- [x] Same repeat toggle + pattern dropdown in Edit Modal
- [x] **🔄 RecurrenceBadge** shown on each recurring todo:
  ```
  bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300
  border border-purple-300 dark:border-purple-700
  ```
- [x] Badge displays pattern name: *🔄 Daily*, *🔄 Weekly*, etc.

### Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Recurring checkbox visible in creation form | ✅ |
| Pattern dropdown shows only when recurring checked | ✅ |
| Creating recurring todo without due date rejected | ✅ |
| Recurring todos show 🔄 badge with pattern name | ✅ |
| Completing recurring todo creates next instance | ✅ |
| New instance inherits title, priority, pattern, reminder | ✅ |
| New instance appears in correct section | ✅ |
| Completing non-recurring todo does NOT create instance | ✅ |
| Disabling recurrence in edit stops future instances | ✅ |
| Invalid recurrence pattern returns 400 | ✅ |

---

## PRP 04 — Reminders & Notifications

**Status:** ✅ Complete  
**Spec file:** [`PRPs/04-reminders-notifications.md`](./04-reminders-notifications.md)

### What was implemented

#### Database (`lib/db.ts`)
- [x] `last_notification_sent TEXT` column migration (safe to re-run)
- [x] `Todo` interface updated with `last_notification_sent: string | null`
- [x] `todoDB.findDueReminders(userId, now)` — finds todos where reminder time has passed and notification not yet sent
- [x] `todoDB.markNotificationSent(id, sentAt)` — stamps `last_notification_sent`
- [x] `todoDB.update()` resets `last_notification_sent = NULL` when `due_date` or `reminder_minutes` changes

#### Reminder options
```typescript
const REMINDER_OPTIONS = [
  { value: null,  label: 'None' },
  { value: 15,    label: '15 minutes before' },
  { value: 30,    label: '30 minutes before' },
  { value: 60,    label: '1 hour before' },
  { value: 120,   label: '2 hours before' },
  { value: 1440,  label: '1 day before' },
  { value: 2880,  label: '2 days before' },
  { value: 10080, label: '1 week before' },
];
```

#### API routes
- [x] `GET /api/notifications/check` — finds due reminders, marks them sent, returns `{ id, title, due_date }[]`
  - Completed todos excluded from results
  - Server-side deduplication via `last_notification_sent` (prevents double-fire across tabs)
  - Validates `reminder_minutes` against allowed values on POST

#### Hook (`lib/hooks/useNotifications.ts`)
- [x] `useNotifications()` — tracks `enabled` state (based on `Notification.permission`)
- [x] `requestPermission()` — calls browser API and updates state

#### UI (`app/page.tsx`)
- [x] **🔔 Enable Notifications** button (orange) in header
- [x] Toggles to **🔔 Notifications On** (green) after permission granted
- [x] `useEffect` polling every 60 seconds when notifications enabled
- [x] Fires `new Notification("⏰ title", { body: "Due at …" })` for each due reminder
- [x] Reminder dropdown in **Add Todo** form — disabled when no due date set
- [x] Reminder dropdown in **Edit Modal** — disabled when no due date set
- [x] `data-testid="reminder-select"` on dropdown
- [x] **🔔 badge** on todo items (e.g. `🔔 1h`, `🔔 1d`)

### Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Reminder dropdown disabled without due date | ✅ |
| Reminder dropdown shows 8 options (None + 7 timings) | ✅ |
| Selected reminder shows 🔔 badge with abbreviated time | ✅ |
| Enable Notifications button requests browser permission | ✅ |
| After permission granted, button shows Notifications On (green) | ✅ |
| `/api/notifications/check` returns only todos where reminder time has passed | ✅ |
| Notification not re-sent after `last_notification_sent` is set | ✅ |
| Editing due date or reminder resets `last_notification_sent` | ✅ |
| Completed todos excluded from notifications | ✅ |
| Invalid reminder value returns 400 | ✅ |

---

## PRP 05 — Subtasks & Progress Tracking

**Status:** ✅ Complete  
**Spec file:** [`PRPs/05-subtasks-progress.md`](./05-subtasks-progress.md)

### What was implemented

#### Database (`lib/db.ts`)
- [x] `subtasks` table created in `initSchema`:
  ```sql
  CREATE TABLE IF NOT EXISTS subtasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  ```
- [x] `Subtask` and `CreateSubtaskInput` interfaces exported
- [x] `subtaskDB.findByTodoId(todoId)` — ordered by position, created_at
- [x] `subtaskDB.findAll()` — all subtasks for bulk loading with todos
- [x] `subtaskDB.create(input)` — auto-increments position
- [x] `subtaskDB.update(id, completed)` — toggle completed state
- [x] `subtaskDB.delete(id)` — returns boolean

#### API routes
- [x] `GET /api/todos/[id]/subtasks` — returns `Subtask[]`
- [x] `POST /api/todos/[id]/subtasks` — validates title (required, max 500 chars); returns `201 Subtask`
- [x] `PUT /api/todos/[id]/subtasks/[subtaskId]` — requires `completed: boolean`
- [x] `DELETE /api/todos/[id]/subtasks/[subtaskId]` — returns `{ success: true }`
- [x] `GET /api/todos` updated — returns todos with embedded `subtasks: Subtask[]`

#### UI (`app/page.tsx`)
- [x] `ProgressBar` component — `role="progressbar"`, `aria-valuenow`, shows `X/Y subtasks`
- [x] **▶ Subtasks** / **▼ Subtasks** expand/collapse toggle per todo
- [x] Expanded view shows subtask list with checkbox + ✕ delete button per row
- [x] Add-subtask input at bottom of expanded list (Enter key submits)
- [x] Toggle/add/delete calls API then refreshes all todos
- [x] `TodoItem` now renders tags, progress bar, and subtasks section

### Acceptance criteria

| Criterion | Status |
|-----------|--------|
| ▶ Subtasks button visible on every todo | ✅ |
| Clicking expands subtask list and add-subtask input | ✅ |
| Adding subtask via Enter key works | ✅ |
| Progress bar appears when at least one subtask exists | ✅ |
| Progress bar shows correct percentage | ✅ |
| `X/Y subtasks` text shows accurate count | ✅ |
| Checking a subtask increments progress bar | ✅ |
| Unchecking a subtask decrements progress bar | ✅ |
| Deleting a subtask recalculates progress | ✅ |
| Clicking ▼ Subtasks collapses the list | ✅ |
| Parent todo deletion cascades to delete all subtasks | ✅ |

---

## PRP 06 — Tag System

**Status:** ✅ Complete  
**Spec file:** [`PRPs/06-tag-system.md`](./06-tag-system.md)

### What was implemented

#### Database (`lib/db.ts`)
- [x] `tags` table (unique per user) and `todo_tags` junction table created in `initSchema`:
  ```sql
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3B82F6',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, name)
  );
  CREATE TABLE IF NOT EXISTS todo_tags (
    todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (todo_id, tag_id)
  );
  ```
- [x] `Tag`, `CreateTagInput`, `UpdateTagInput` interfaces exported
- [x] `tagDB.findByUserId(userId)` — ordered by name
- [x] `tagDB.findById(id)` — for ownership check
- [x] `tagDB.create(input)` — with default color `#3B82F6`
- [x] `tagDB.update(id, input)` — name and/or color
- [x] `tagDB.delete(id)` — cascades via `todo_tags`
- [x] `tagDB.setTodoTags(todoId, tagIds)` — transactional replace
- [x] `tagDB.getTagsForTodo(todoId)` — for single todo response
- [x] `tagDB.findWithTodoIds()` — JOIN for bulk loading with todos

#### API routes
- [x] `GET /api/tags` — returns `Tag[]` sorted by name
- [x] `POST /api/tags` — validates name (required, max 50 chars), color (valid hex); returns `201 Tag`; `400` on duplicate
- [x] `PUT /api/tags/[id]` — partial update name/color; `400` on duplicate name
- [x] `DELETE /api/tags/[id]` — cascades to `todo_tags`
- [x] `POST /api/todos` accepts `tagIds: number[]` — calls `tagDB.setTodoTags` after create
- [x] `PUT /api/todos/[id]` accepts `tagIds: number[]` — calls `tagDB.setTodoTags` after update
- [x] Recurring todo completion copies tags to new instance
- [x] `GET /api/todos` updated — returns todos with embedded `tags: Tag[]`

#### UI (`app/page.tsx`)
- [x] `TagPill` component — colored rounded pill with white text
- [x] `TagSelector` component — clickable pills with ✓ checkmark when selected
- [x] **🏷️ Manage Tags** button in header → opens tag management modal
- [x] Tag management modal:
  - Lists all tags with color swatch, name, **Edit** / **Delete** actions
  - Inline edit row with color picker + name input
  - Create new tag form at the bottom (color picker + name input + **Create** button, Enter key submits)
  - Error display for duplicate names or invalid hex
- [x] Tag selector in **Add Todo** form
- [x] Tag selector in **Edit Modal** (pre-selects existing tags)
- [x] Tags displayed as colored pills on each todo item
- [x] **Tag filter dropdown** (`data-testid="tag-filter"`) above todo list — AND logic with priority filter
- [x] Filter clears automatically when the filtered tag is deleted

### Acceptance criteria

| Criterion | Status |
|-----------|--------|
| User can create a tag with name and color | ✅ |
| Default tag color is `#3B82F6` (blue) | ✅ |
| Tag names unique per user (duplicate rejected with 400) | ✅ |
| Tags appear as colored pills on tagged todos | ✅ |
| Multiple tags can be assigned to one todo | ✅ |
| Tag selector shows ✓ checkmark on selected tags | ✅ |
| Tags can be toggled on/off in create and edit forms | ✅ |
| Tag management modal shows all tags with Edit/Delete | ✅ |
| Editing a tag updates all todos using that tag | ✅ |
| Deleting a tag removes it from all todos | ✅ |
| Tag filter shows only todos with the selected tag | ✅ |
| Tag filter combines with priority filter (AND logic) | ✅ |
| Invalid color hex returns 400 | ✅ |

---

## Notes

### PRP 11 — Removed

WebAuthn/Passkeys authentication (PRP 11) was removed per product decision on 2026-07-03.

**Deleted files:**
- `middleware.ts`
- `app/login/page.tsx`
- `app/api/auth/register-options/route.ts`
- `app/api/auth/register-verify/route.ts`
- `app/api/auth/login-options/route.ts`
- `app/api/auth/login-verify/route.ts`
- `app/api/auth/logout/route.ts`
- `lib/auth.ts`
- `lib/challenges.ts`

**Removed packages:** `@simplewebauthn/server`, `@simplewebauthn/browser`, `jose`

The app now runs as a **single-user, no-login application**. The `/` route is publicly accessible. The `todos` table retains a `user_id` column (defaulting to `1`) for forward compatibility.

---

## Test Coverage Status

| Test file | Status |
|-----------|--------|
| `tests/02-todo-crud.spec.ts` | ⬜ Not yet written |
| `tests/03-priority.spec.ts` | ⬜ Not yet written |
| `tests/04-recurring.spec.ts` | ⬜ Not yet written |

E2E test scaffolds are defined in each PRP file. `data-testid` attributes and `aria-label` on checkboxes have been added to support Playwright selectors.
