# Todo App MVP — Design Spec

**Date**: 2026-07-03  
**Scope**: MVP — Todo CRUD + WebAuthn Authentication  
**Stack**: Next.js 16 (App Router), SQLite (better-sqlite3), WebAuthn (@simplewebauthn), JWT sessions, Tailwind CSS 4, Singapore timezone

---

## 1. Overview

Build a passwordless todo app in the root of this repo. Users register/login using biometric passkeys (WebAuthn). Once authenticated, they manage a personal todo list with priorities and due dates.

**In scope for MVP:**
- WebAuthn registration and login
- JWT session cookies (7-day expiry, HTTP-only)
- Route protection via middleware
- Todo CRUD (create, read, update, delete, toggle completion)
- Priority levels: high / medium / low
- Due dates in Singapore timezone (Asia/Singapore)
- Auto-sorting: priority → due date → creation date
- Three sections: Overdue, Pending, Completed
- Basic Tailwind UI with dark mode (system preference)

**Out of scope for MVP** (future phases):
- Recurring todos, reminders, subtasks, tags, templates
- Export/import, search/filtering, calendar view

---

## 2. Architecture

```
repo root/
├── app/
│   ├── page.tsx              # Main todo UI (client component)
│   ├── layout.tsx            # Root layout
│   ├── api/
│   │   ├── auth/
│   │   │   ├── register-options/route.ts
│   │   │   ├── register-verify/route.ts
│   │   │   ├── login-options/route.ts
│   │   │   ├── login-verify/route.ts
│   │   │   └── logout/route.ts
│   │   └── todos/
│   │       ├── route.ts          # GET list, POST create
│   │       └── [id]/route.ts     # PUT update, DELETE delete
├── lib/
│   ├── db.ts                 # SQLite schema + all DB operations
│   ├── auth.ts               # JWT session helpers
│   └── timezone.ts           # Singapore timezone utilities
├── middleware.ts             # Protect / and /calendar routes
├── todos.db                  # SQLite file (gitignored)
├── package.json
├── tailwind.config.ts
└── next.config.ts
```

**Data flow:**
- Client (`app/page.tsx`) ↔ API routes ↔ `lib/db.ts` (synchronous better-sqlite3)
- Auth state stored in HTTP-only cookie (`token`)
- `middleware.ts` checks JWT on every request to protected routes

---

## 3. Database Schema

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE authenticators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  credential_id TEXT UNIQUE NOT NULL,
  credential_public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'medium',  -- 'high' | 'medium' | 'low'
  due_date TEXT,                             -- ISO string, Singapore time
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

---

## 4. WebAuthn Flow

**Registration:**
1. `POST /api/auth/register-options` → returns challenge, stores in session store (in-memory Map keyed by username)
2. Client calls `startRegistration()` from `@simplewebauthn/browser`
3. `POST /api/auth/register-verify` → verifies with `verifyRegistrationResponse()`, creates user + authenticator rows, sets JWT cookie

**Login:**
1. `POST /api/auth/login-options` → looks up user, returns challenge
2. Client calls `startAuthentication()` from `@simplewebauthn/browser`
3. `POST /api/auth/login-verify` → verifies with `verifyAuthenticationResponse()`, updates counter, sets JWT cookie

**Session:** JWT payload `{ userId, username }`, signed with `JWT_SECRET` env var, 7-day expiry, HTTP-only cookie named `token`.

---

## 5. API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register-options` | Get WebAuthn registration challenge |
| POST | `/api/auth/register-verify` | Verify registration, create account |
| POST | `/api/auth/login-options` | Get WebAuthn login challenge |
| POST | `/api/auth/login-verify` | Verify login, issue JWT cookie |
| POST | `/api/auth/logout` | Clear JWT cookie |
| GET | `/api/todos` | List user's todos (sorted) |
| POST | `/api/todos` | Create todo |
| PUT | `/api/todos/[id]` | Update todo (title, priority, due_date, completed) |
| DELETE | `/api/todos/[id]` | Delete todo |

---

## 6. UI Components (app/page.tsx)

Single `'use client'` page component with:

1. **Auth screen** (shown when not logged in):
   - Username input
   - "Register" and "Login" buttons
   - Uses `@simplewebauthn/browser` for both flows

2. **Todo form**:
   - Text input (title, required)
   - Priority dropdown (High / Medium / Low)
   - Date-time picker (optional, must be future, Singapore time)
   - "Add" button

3. **Todo list** — three collapsible sections:
   - **Overdue** (red bg): past due_date, not completed
   - **Pending** (default): future/no due date, not completed
   - **Completed**: checked items
   
   Each todo row: checkbox | title + priority badge + due date | Edit | Delete

4. **Edit modal**: pre-filled form fields, "Update" + "Cancel" buttons

5. **Dark mode**: automatic via `prefers-color-scheme`

---

## 7. Singapore Timezone

`lib/timezone.ts` exports:
- `getSingaporeNow()` — returns current time as Date in SGT
- `formatSingaporeDate(isoString)` — formats a stored ISO string for display
- `toSingaporeISOString(date)` — converts Date to SGT ISO string

All `due_date` values stored and compared in Singapore time.

---

## 8. Error Handling

- API routes return `{ error: string }` with appropriate HTTP status (400, 401, 404, 500)
- Client shows inline error messages (no alert dialogs)
- Required field validation: empty/whitespace title rejected
- Due date validation: must be at least 1 minute in the future (Singapore time)

---

## 9. Environment Variables

```env
JWT_SECRET=<random-secret>       # Required — used to sign session JWTs
```

Provide `.env.local.example` with documented variables.

---

## 10. Out-of-Scope Decisions (Explicit)

- No tags, subtasks, templates, recurring todos, or reminders in MVP
- No CSV/JSON export in MVP
- No calendar view in MVP
- No manual dark mode toggle (system preference only)
- No search or filtering in MVP
- No rate limiting or CAPTCHA in MVP
- Challenges stored in-memory (Map) — acceptable for single-process dev server; not suitable for multi-instance prod
