# One-Shot Implementation Prompt — Todo App (All 11 Features)

Self-contained build spec for the entire app in a single pass. It condenses `PRPs/01`–`11` (each 300–450 lines) into one dense reference so the implementing agent doesn't need to load all eleven files. **Read only this file.** Consult an individual `PRPs/0N-*.md` only if you hit an ambiguity this file doesn't resolve — they hold the full rationale, prose, and example code intentionally cut here.

## Execution Rules (read first — this is the point of the file)

1. Do not open `USER_GUIDE.md`, `EVALUATION.md`, or the individual PRPs unless genuinely stuck — everything needed is condensed below.
2. Build in the order given under "Build Order," in one continuous pass. Don't stop to ask for confirmation between features; make the conventional choice and move on.
3. Write the full schema and full type set once (Phase 0), not incrementally per feature.
4. Write files directly. Don't paste full file contents back into the conversation — a one-line "wrote `path`" per file is enough.
5. Run tests/typecheck once per completed feature, not after every edit, plus once at the end.
6. Don't restate a section back before implementing it — just implement it.
7. Follow the Model Routing table below — it's the single biggest lever for keeping this cheap and fast.

## Model Routing

Use **claude-sonnet-4.6** only where correctness risk is high (security, subtle math, cross-feature integration, foundational schema). Route everything else — repetitive CRUD, UI boilerplate, mechanical tests — to **auto** (lets the system select the cheapest capable model). Roughly 70% of the line count across the 11 features is repetitive CRUD + UI scaffolding, so this is where the token/cost savings actually come from.

| Task | Model | Why |
|---|---|---|
| Phase 0: schema + types | **claude-sonnet-4.6** | Foundational — mistakes cascade into all 11 features |
| Auth: WebAuthn flow, session, middleware (11) | **claude-sonnet-4.6** | Security-critical; subtle correctness (counter regression, credential encoding) |
| Todo sort/section comparator + API routes (01) | **claude-sonnet-4.6** | Cross-cutting logic every other feature depends on |
| Recurring due-date calculation (03) | **claude-sonnet-4.6** | Month/year-end clamping edge cases, easy to get subtly wrong |
| Reminder polling + dedup logic (04) | **claude-sonnet-4.6** | Timing/race-condition correctness |
| Export/Import transaction + ID remap + tag conflict resolution (09) | **claude-sonnet-4.6** | Multi-table transaction, data-integrity critical |
| Calendar grid generation (10) | **claude-sonnet-4.6** | Leap years, 5-vs-6-week rows, timezone boundary correctness |
| Priority badges, recurrence/reminder/tag badge components (02) | auto | Small, fully-specified UI components |
| Tags CRUD routes + Manage Tags modal (06) | auto | Repeats the CRUD pattern Sonnet establishes in Phase 0/01 |
| Subtasks CRUD routes + UI (05) | auto | Same — mechanical once the pattern exists |
| Templates CRUD (excl. `/use`) (07) | auto | Same — mechanical once the pattern exists |
| Search/filter pure functions + UI (08) | auto | Fully specified by `FilterState` + fixed AND order below, mechanical translation |
| CSV export flattening (09) | auto | String formatting, no correctness ambiguity |
| Holiday seed script (10) | auto | Static data insertion |
| Playwright test cases (all features) | auto | Mechanical once `tests/helpers.ts` exists |

**How to apply in Claude Code:** for `auto`-routed rows, dispatch via the `Agent` tool with `model: "auto"`; batch a whole feature's CRUD route + UI component + tests into *one* subagent call rather than one call per file — dispatch overhead eats the savings otherwise. For `claude-sonnet-4.6`-routed rows, do the work directly yourself (no subagent) so it benefits from the accumulated context of the schema/type decisions made in Phase 0.

## Stack & Layout

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · better-sqlite3 (synchronous, no async/await for DB calls) · `@simplewebauthn/server` + `@simplewebauthn/browser` (WebAuthn, no passwords) · JWT session in HTTP-only cookie (7-day expiry) · Playwright E2E · **Singapore timezone (`Asia/Singapore`) everywhere** via `lib/timezone.ts` (`getSingaporeNow()`, `formatSingaporeDate()`) — never `new Date()` directly.

```
lib/db.ts                    # all interfaces + CRUD DB objects (todoDB, tagDB, subtaskDB, templateDB, holidayDB)
lib/auth.ts                  # createSession, getSession, deleteSession
lib/timezone.ts               # getSingaporeNow, formatSingaporeDate
lib/hooks/useNotifications.ts
middleware.ts                 # protects `/` and `/calendar`
app/page.tsx                  # 'use client', monolithic — all main UI (this IS the intended pattern, don't split it)
app/calendar/page.tsx         # 'use client'
app/login/page.tsx
app/api/**/*.ts               # route handlers, see API Surface table
tests/*.spec.ts, tests/helpers.ts   # createTodo(), addSubtask(), createTag() + add per-feature helpers as needed
scripts/seed-holidays.ts
```

Every API route: check session first, `NextResponse.json({ error: 'Not authenticated' }, { status: 401 })` if absent, use `session.userId` for all queries. Next.js 16 route params are a `Promise`: `const { id } = await params`.

## Build Order

1. **Auth** (11) — foundational; every other route needs `session.userId`
2. **Todo CRUD** (01) — base `todos` table + API
3. **Priority** (02) — extends 01
4. **Recurring Todos** (03) — extends 01, inherits 02
5. **Reminders & Notifications** (04) — extends 01
6. **Subtasks & Progress** (05) — new table, FK to todos
7. **Tag System** (06) — new tables, FK to todos
8. **Template System** (07) — needs 01–05
9. **Search & Filtering** (08) — client-side, needs 01/02/06
10. **Export & Import** (09) — needs 01/05/06
11. **Calendar View** (10) — needs 01/02, protected by 11's middleware

(This is auth-first, unlike `PRPs/README.md`'s value-priority ordering which defers auth to last — technically you need `session.userId` before any other route is meaningful, so build it first here.)

## 5-Person Team Split

Dependencies flow in waves. No one in Wave N+1 can start until all Wave N deliverables are merged into `sprint`.

### Wave 1 — Unblock everyone else first

| Person | Features | PRPs | Model | Branch |
|--------|----------|------|-------|--------|
| **A — Integration Lead** | Phase 0 schema + types, Auth / WebAuthn | `11` | claude-sonnet-4.6 | `feat/member-a-auth` |

**Person A must deliver first.** Every other person depends on `session.userId` and the full DB schema. Person A also owns `lib/db.ts`, `lib/auth.ts`, `lib/timezone.ts`, and `middleware.ts`. Do not start Wave 2 until Person A's PR is merged.

---

### Wave 2 — Core todo model (start after Wave 1 merged)

| Person | Features | PRPs | Model | Branch |
|--------|----------|------|-------|--------|
| **B — Core Todo** | Todo CRUD, Priority | `01`, `02` | claude-sonnet-4.6 (routes) / auto (UI badges) | `feat/member-b-crud-priority` |

**Prerequisites:** Person A's `feat/member-a-auth` merged into `sprint`.  
Person B owns `app/api/todos/`, `app/page.tsx` base structure, and the `todos` table schema (already created by A — B only adds API routes + UI).

---

### Wave 3 — Parallel build (start after Wave 2 merged)

Both C and D work in parallel once Person B's branch is merged.

| Person | Features | PRPs | Model | Branch |
|--------|----------|------|-------|--------|
| **C — Recurring + Reminders** | Recurring Todos, Reminders & Notifications | `03`, `04` | claude-sonnet-4.6 | `feat/member-c-recurring-reminders` |
| **D — Subtasks + Tags + Search** | Subtasks & Progress, Tag System, Search & Filtering | `05`, `06`, `08` | auto (05, 06, 08 all mechanical) | `feat/member-d-subtasks-tags-search` |

**Person C prerequisites:** `feat/member-b-crud-priority` merged. Owns `recurrence_pattern`, `reminder_minutes` columns, `app/api/notifications/check/`, `lib/hooks/useNotifications.ts`.  
**Person D prerequisites:** `feat/member-b-crud-priority` merged. Owns `subtasks`, `tags`, `todo_tags` tables + their API routes + filter UI in `app/page.tsx`. Build in order: subtasks → tags → search (search needs tags to exist).

---

### Wave 4 — Integration features (start after Wave 3 fully merged)

| Person | Features | PRPs | Model | Branch |
|--------|----------|------|-------|--------|
| **E — Templates + Export/Import + Calendar** | Template System, Export & Import, Calendar View | `07`, `09`, `10` | claude-sonnet-4.6 (09, 10) / auto (07 CRUD) | `feat/member-e-templates-export-calendar` |

**Prerequisites:** ALL of Waves 1–3 merged into `sprint` (needs todos, subtasks, tags, recurrence, reminders).  
Person E also handles final integration: resolves any cross-feature conflicts, runs full Playwright suite, and opens the final `sprint → main` PR for submission.

---

### Merge order summary

```
Wave 1:  A (auth + schema)
Wave 2:  B (crud + priority)
Wave 3:  C (recurring + reminders)  ──┐  parallel
         D (subtasks + tags + search) ─┘
Wave 4:  E (templates + export + calendar + final integration)
```

### File ownership — who touches what

| File / Area | Owner |
|-------------|-------|
| `lib/db.ts`, `lib/auth.ts`, `lib/timezone.ts`, `middleware.ts` | A |
| `app/api/todos/` base routes, `app/page.tsx` skeleton | B |
| `app/api/todos/[id]/` recurrence logic, `app/api/notifications/` | C |
| `app/api/subtasks/`, `app/api/tags/`, filter state in `app/page.tsx` | D |
| `app/api/templates/`, `app/api/todos/export`, `app/calendar/` | E |
| `tests/helpers.ts` base | A or B |
| Per-feature Playwright tests | each owner writes their own |

**Conflict rule:** if two people need to edit `app/page.tsx` at the same time (B skeleton, D filter UI), D branches from B's latest and rebases onto sprint after B merges.

## Database Schema (create all at once — Phase 0)

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE authenticators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT UNIQUE NOT NULL,
  credential_public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_authenticators_user_id ON authenticators(user_id);

CREATE TABLE todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,                              -- ISO 8601, Singapore local, nullable
  priority TEXT NOT NULL DEFAULT 'medium',    -- 'high' | 'medium' | 'low'
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern TEXT,                    -- 'daily' | 'weekly' | 'monthly' | 'yearly'
  reminder_minutes INTEGER,                   -- 15 | 30 | 60 | 120 | 1440 | 2880 | 10080
  last_notification_sent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX idx_todos_user_id ON todos(user_id);
CREATE INDEX idx_todos_due_date ON todos(due_date);

CREATE TABLE subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_subtasks_todo_id ON subtasks(todo_id);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, name)
);

CREATE TABLE todo_tags (
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (todo_id, tag_id)
);

CREATE TABLE templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  title_template TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern TEXT,
  reminder_minutes INTEGER,
  due_date_offset_minutes INTEGER,            -- minutes from "use" time to compute new due_date; NULL = no due date
  subtasks_json TEXT,                         -- JSON.stringify([{ title, position }]); NULL = none
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,     -- YYYY-MM-DD, Asia/Singapore, global (not user-scoped)
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_holidays_date ON holidays(date);
```

better-sqlite3 needs `PRAGMA foreign_keys = ON` for `ON DELETE CASCADE` to actually fire — set it once at DB init.

## TypeScript Types (`lib/db.ts`)

```typescript
export type Priority = 'high' | 'medium' | 'low';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type ReminderMinutes = 15 | 30 | 60 | 120 | 1440 | 2880 | 10080; // 15m,30m,1h,2h,1d,2d,1w

export interface User { id: number; username: string; created_at: string; }
export interface Authenticator { id: number; user_id: number; credential_id: string; credential_public_key: Buffer; counter: number; created_at: string; }
export interface Session { userId: number; username: string; }

export interface Todo {
  id: number; user_id: number; title: string; completed: boolean;
  due_date: string | null; priority: Priority;
  is_recurring: boolean; recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null; last_notification_sent: string | null;
  created_at: string; updated_at: string | null;
  subtasks?: Subtask[]; tags?: Tag[];
}
export interface Subtask { id: number; todo_id: number; title: string; completed: boolean; position: number; created_at: string; }
export interface Tag { id: number; user_id: number; name: string; color: string; created_at: string; }
export interface Template {
  id: number; user_id: number; name: string; description: string | null; category: string | null;
  title_template: string; priority: Priority; is_recurring: boolean; recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null; due_date_offset_minutes: number | null; subtasks_json: string | null; created_at: string;
}
export interface Holiday { id: number; date: string; name: string; }
```

## API Surface

| Method | Path | Feature |
|---|---|---|
| POST | `/api/auth/register-options`, `/register-verify`, `/login-options`, `/login-verify`, `/logout` | Auth |
| GET | `/api/auth/me` | Auth |
| POST/GET | `/api/todos` | Todo CRUD |
| GET/PUT/DELETE | `/api/todos/[id]` | Todo CRUD (PUT also handles recurring completion) |
| POST | `/api/todos/[id]/subtasks` | Subtasks |
| PUT/DELETE | `/api/subtasks/[id]` | Subtasks |
| GET/POST | `/api/tags` | Tags |
| PUT/DELETE | `/api/tags/[id]` | Tags |
| POST/DELETE | `/api/todos/[id]/tags` | Tags (attach/detach) |
| GET/POST | `/api/templates` | Templates |
| PUT/DELETE | `/api/templates/[id]` | Templates |
| POST | `/api/templates/[id]/use` | Templates |
| GET | `/api/todos/export?format={json\|csv}` | Export/Import |
| POST | `/api/todos/import` | Export/Import |
| GET | `/api/holidays` | Calendar |
| GET | `/api/notifications/check` | Reminders |

Search & Filtering (08) adds **no** server endpoints — it's pure client-side over `GET /api/todos`.

## Per-Feature Spec

**1. Auth (WebAuthn)** — `users`/`authenticators` tables above. 4-step flow: client fetches challenge from `*-options` → `@simplewebauthn/browser` `startRegistration`/`startAuthentication` → POST result to `*-verify` → server `verifyRegistrationResponse`/`verifyAuthenticationResponse`, persists/updates authenticator, calls `createSession`. **Always** `counter: authenticator.counter ?? 0` (undefined-counter bug, real pitfall). Use `isoBase64URL` from `@simplewebauthn/server/helpers` for `credential_id`. Reject login if new counter isn't greater than stored (clone-attack defense), except both-zero. `middleware.ts` redirects unauthenticated `/` and `/calendar` to `/login`; `/login` redirects authenticated users to `/`. Session: JWT, HTTP-only cookie, 7-day expiry.

**2. Todo CRUD** — `title` required/trimmed/non-empty, `priority` default `medium`, `due_date` optional but if set must be ≥ now+1min (Singapore). Sections: **Overdue** (`due_date<now && !completed`), **Pending** (`due_date>=now || due_date is null`, `&& !completed`), **Completed**. Sort within Overdue/Pending: priority(high→med→low) → due_date(earliest→latest) → created_at(newest→oldest tiebreak). Delete is immediate, no confirm, cascades subtasks+tags. Optimistic UI updates in `app/page.tsx`.

**3. Priority** — enum `high|medium|low`, default `medium`. Badge colors — light: red `#EF4444`/yellow `#F59E0B`/blue `#3B82F6`; dark: red `#F87171`/yellow `#FBBF24`/blue `#60A5FA`. Must hit WCAG AA contrast both modes.

**4. Recurring Todos** — `is_recurring`+`recurrence_pattern`; **requires `due_date`** (validate on create). On completion (`PUT /api/todos/[id]` with `completed:true` and `is_recurring`), insert next instance inheriting title/priority/tags/reminder/pattern; `due_date` via `calculateNextDueDate(current, pattern)`: daily +1d, weekly +7d, monthly same day next month (clamp to last day if overflow, e.g. Jan 31→Feb 28/29), yearly +1y (Feb 29→Feb 28 on non-leap target). Badge `🔄 {pattern}`, purple.

**5. Reminders & Notifications** — `reminder_minutes ∈ {15,30,60,120,1440,2880,10080}`; UI dropdown disabled without `due_date`. `GET /api/notifications/check`: rows where `now` is within `[due_date - reminder_minutes, due_date]` and `last_notification_sent` doesn't already cover this window. Client polls every **30s** via `useNotifications` hook, calls `Notification` API, then updates `last_notification_sent`. Badge `🔔 15m/30m/1h/2h/1d/2d/1w`.

**6. Subtasks & Progress** — `subtasks(todo_id FK cascade, title, completed, position)`. Progress `= completed/total*100`; bar blue `<100%`, **green at exactly 100%**; text `"X/Y subtasks"`; hide progress UI entirely at zero subtasks. Add appends at `max(position)+1`; delete doesn't renumber remaining.

**7. Tag System** — `tags(user_id, name UNIQUE per user, color default '#3B82F6')`, `todo_tags` join, cascade both ways. Attach/detach idempotent (no-op if already in that state). "Manage Tags" modal: create/edit/delete; edit propagates live everywhere (no denormalized copies).

**8. Template System** — `title_template`/`priority`/`is_recurring`/`recurrence_pattern`/`reminder_minutes`/`due_date_offset_minutes`/`subtasks_json`. **Subtasks ARE captured** (title+position, via JSON) — this overrides `USER_GUIDE.md`'s simplified claim that they aren't; `due_date` and `tags` are the only things excluded. `POST /api/templates/[id]/use`: `due_date = due_date_offset_minutes==null ? null : getSingaporeNow()+offset`; parse `subtasks_json`, insert as new subtask rows with `completed=false`. Deleting a template never affects todos already created from it.

**9. Search & Filtering** — pure client-side over already-fetched `Todo[]`, no new endpoints. `FilterState{search,priority,tagId,completion,dueDateFrom,dueDateTo}`. `applyFilters` must apply in **this exact AND order**: search → priority → tag → completion → date range. Search matches todo title + all subtask titles, case-insensitive, partial, debounced 300ms. Saved presets in `localStorage['todo-app:filter-presets']` as `{id,name,filters,createdAt}[]`.

**10. Export & Import** — `GET /api/todos/export?format=json|csv`, filename `todos-YYYY-MM-DD.{ext}`. JSON envelope `{version:1, exported_at, todos:[{...todo, subtasks:[...], tags:[{name,color}]}]}` — **tags and subtasks ARE included** (overrides `USER_GUIDE.md`'s simplified claim), only original IDs are dropped. CSV is one-way (not re-importable), columns `ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder`, properly quote/escape commas. `POST /api/todos/import`: validate structure (zod) before writing anything; single transaction; new IDs throughout; tag conflict resolution = case-insensitive name match reuses existing tag id, else creates one. Re-importing the same file is expected to duplicate todos (by design, not a bug).

**11. Calendar View** — `holidays` table (global, seeded via `scripts/seed-holidays.ts`), `GET /api/holidays`. `/calendar` route (protected by feature 1's middleware). `generateCalendarGrid(year, month)` always produces a full grid (5 or 6 rows) with leading/trailing adjacent-month days, `isToday`/`isPast`/`isWeekend` flags. URL state `?month=YYYY-MM` (invalid/out-of-range → fall back to current month). Todos rendered on their `due_date` cell, color-coded by priority; overflow → count badge; click a day → modal listing that day's todos. Holiday name shown on its cell.

## Testing

Playwright, virtual WebAuthn authenticators (Chromium flags in `playwright.config.ts`), `timezoneId: 'Asia/Singapore'` set globally. Test files (exact names, first two confirmed from existing convention):

`tests/01-authentication.spec.ts` · `02-todo-crud.spec.ts` · `03-priority.spec.ts` · `04-due-dates.spec.ts` (optional, can fold into 02) · `05-recurring-todos.spec.ts` · `06-reminders.spec.ts` · `07-subtasks.spec.ts` · `08-tags.spec.ts` · `09-templates.spec.ts` · `10-search-filtering.spec.ts` · `11-export-import.spec.ts` · `12-calendar.spec.ts`

`tests/helpers.ts` exports `createTodo()`, `addSubtask()`, `createTag()` — add `createTemplate()`, `login()`, `register()` following the same camelCase convention as each feature needs them.

## Definition of Done

- [ ] All 8 tables created, `PRAGMA foreign_keys = ON` set
- [ ] All API routes in the surface table implemented, each checking session first
- [ ] `npm run build` and `npm run lint` pass, no TypeScript errors
- [ ] All Singapore-timezone-sensitive logic goes through `lib/timezone.ts`, no raw `new Date()`
- [ ] No `console.log` left in shipped code
- [ ] `npx playwright test` passes for all 12 spec files
- [ ] The two documented cross-file resolutions honored: templates include subtasks (not due date/tags); export/import includes tags+subtasks (not original IDs)

## Reference

Full rationale, UI code examples, and exhaustive edge cases for any feature: `PRPs/0N-*.md` (matching the feature numbers in **Per-Feature Spec** above minus 1 — e.g. feature "4. Recurring Todos" here is `PRPs/03-recurring-todos.md`). Only open them if this file doesn't resolve the question.
