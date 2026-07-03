# PRP Implementation Progress

> Last updated: 2026-07-03  
> Branch: `zentilt-run-dev-server`  
> Commit: `94c2ea2`

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
| PRP 07 | Template System | ⬜ Not started | — |
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
