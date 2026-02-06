# Todo App with Passkey Authentication

A full-featured todo application built with Next.js 16, featuring passwordless WebAuthn/Passkey authentication, recurring todos, subtasks, tags, templates, calendar view, and more.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Prerequisites](#prerequisites)
4. [Getting Started](#getting-started)
5. [Environment Variables](#environment-variables)
6. [Project Structure](#project-structure)
7. [API Endpoints](#api-endpoints)
8. [Authentication](#authentication)
9. [Testing](#testing)
10. [Deployment](#deployment)
11. [Troubleshooting](#troubleshooting)

---

## Features

- **Passkey Authentication** — Passwordless login using WebAuthn (Windows Hello, Touch ID, Face ID, FIDO2 keys)
- **Todo CRUD** — Create, read, update, and delete todos with priority levels and due dates
- **Recurring Todos** — Daily, weekly, monthly, and yearly recurrence patterns
- **Subtasks** — Break todos into smaller tasks with progress tracking
- **Tags** — Color-coded tags for categorization and filtering
- **Templates** — Save and reuse todo configurations
- **Calendar View** — Visualize todos by due date on a monthly calendar
- **Search & Filter** — Search by title, filter by priority, status, and tags
- **Export/Import** — Backup and restore todos as JSON
- **Reminders** — Browser notifications for upcoming due dates
- **Singapore Timezone** — All dates handled in Asia/Singapore timezone

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org/) (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Database | SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| Auth | WebAuthn/Passkeys via [@simplewebauthn](https://simplewebauthn.dev/) |
| Sessions | JWT via [jose](https://github.com/panva/jose) |
| Testing | [Playwright](https://playwright.dev/) (E2E) |
| Deployment | [Railway](https://railway.com/) with Docker |

---

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0
- A browser that supports WebAuthn (Chrome, Edge, Firefox, Safari)

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/kenken64/AI-SDLC-Workshop-Day1.git
cd AI-SDLC-Workshop-Day1
git checkout solution
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_RP_ID=localhost
NEXT_PUBLIC_ORIGIN=http://localhost:3000
JWT_SECRET=your-secret-key-change-in-production
```

### 4. Seed holiday data (optional)

```bash
npx tsx scripts/seed-holidays.ts
```

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you should see the login page.

### 6. Register and log in

1. Enter a username and click **Register**
2. Follow the WebAuthn prompt (fingerprint, face, PIN, or security key)
3. You're in — start creating todos

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_RP_ID` | WebAuthn Relying Party ID (your domain) | `localhost` |
| `NEXT_PUBLIC_ORIGIN` | App origin URL | `http://localhost:3000` |
| `JWT_SECRET` | Secret key for signing JWT session tokens | — |

---

## Project Structure

```
.
├── app/
│   ├── api/
│   │   ├── auth/           # WebAuthn registration & login
│   │   │   ├── login-options/
│   │   │   ├── login-verify/
│   │   │   ├── logout/
│   │   │   ├── me/
│   │   │   ├── register-options/
│   │   │   └── register-verify/
│   │   ├── holidays/       # Holiday data API
│   │   ├── notifications/  # Reminder notifications
│   │   ├── subtasks/       # Subtask management
│   │   ├── tags/           # Tag CRUD & assignment
│   │   ├── templates/      # Template CRUD & usage
│   │   └── todos/          # Todo CRUD, export, import
│   ├── calendar/           # Calendar view page
│   ├── login/              # Login/register page
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Main todo list page
├── lib/
│   ├── auth.ts             # JWT session management
│   ├── db.ts               # SQLite database & repositories
│   ├── hooks/              # Custom React hooks
│   └── timezone.ts         # Singapore timezone utilities
├── tests/                  # Playwright E2E tests
│   ├── 01-authentication.spec.ts
│   ├── 02-todo-crud.spec.ts
│   ├── 03-priority-recurring.spec.ts
│   ├── 04-subtasks.spec.ts
│   ├── 05-tags.spec.ts
│   ├── 06-templates.spec.ts
│   ├── 07-search-filtering.spec.ts
│   ├── 08-export-import.spec.ts
│   └── helpers.ts
├── scripts/
│   └── seed-holidays.ts    # Holiday data seeder
├── Dockerfile              # Production Docker build
├── railway.toml            # Railway deployment config
├── railway.json            # Railway build config
└── package.json
```

---

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register-options` | Generate WebAuthn registration challenge |
| POST | `/api/auth/register-verify` | Verify registration and create user |
| POST | `/api/auth/login-options` | Generate WebAuthn authentication challenge |
| POST | `/api/auth/login-verify` | Verify authentication and create session |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/auth/me` | Get current user |

### Todos

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/todos` | List all todos |
| POST | `/api/todos` | Create a todo |
| GET | `/api/todos/[id]` | Get a todo |
| PUT | `/api/todos/[id]` | Update a todo |
| DELETE | `/api/todos/[id]` | Delete a todo |
| GET | `/api/todos/export` | Export todos as JSON |
| POST | `/api/todos/import` | Import todos from JSON |

### Subtasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/todos/[id]/subtasks` | List subtasks |
| POST | `/api/todos/[id]/subtasks` | Create a subtask |
| PUT | `/api/subtasks/[id]` | Update a subtask |
| DELETE | `/api/subtasks/[id]` | Delete a subtask |

### Tags

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tags` | List all tags |
| POST | `/api/tags` | Create a tag |
| PUT | `/api/tags/[id]` | Update a tag |
| DELETE | `/api/tags/[id]` | Delete a tag |
| POST | `/api/todos/[id]/tags` | Assign tags to a todo |

### Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/templates` | List all templates |
| POST | `/api/templates` | Create a template |
| DELETE | `/api/templates/[id]` | Delete a template |
| POST | `/api/templates/[id]/use` | Create todo from template |

---

## Authentication

This app uses **WebAuthn/Passkeys** for passwordless authentication via the `@simplewebauthn` library.

### Supported authenticators

- **Windows Hello** (PIN, fingerprint, face recognition)
- **macOS Touch ID / Face ID**
- **Linux** (FIDO2-compatible authenticators)
- **FIDO2 security keys** (YubiKey, etc.)
- **Mobile devices** (Android biometrics, iOS Face/Touch ID)

### How it works

1. **Registration** — User creates a discoverable passkey credential tied to the app's domain
2. **Login** — Browser prompts for the stored passkey, verifies cryptographically on the server
3. **Session** — JWT token stored in an HTTP-only cookie, validated by middleware on protected routes

---

## Testing

The project includes Playwright E2E tests covering all core features.

### Install Playwright browsers

```bash
npx playwright install
```

### Run all tests

```bash
npx playwright test
```

### Run a specific test

```bash
npx playwright test tests/01-authentication.spec.ts
```

### Run in headed mode (visible browser)

```bash
npx playwright test --headed
```

### View test report

```bash
npx playwright show-report
```

---

## Deployment

### Railway (Docker)

The app is configured for Railway deployment using Docker.

1. Connect your GitHub repository in the [Railway dashboard](https://railway.com/)
2. Set the deploy branch to `solution`
3. Configure environment variables in Railway:
   - `NEXT_PUBLIC_RP_ID` — your production domain (e.g., `myapp.up.railway.app`)
   - `NEXT_PUBLIC_ORIGIN` — your production URL (e.g., `https://myapp.up.railway.app`)
   - `JWT_SECRET` — a strong random secret
4. Railway will auto-deploy on push

### Manual Docker build

```bash
docker build -t todo-app .
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_RP_ID=localhost \
  -e JWT_SECRET=your-secret \
  todo-app
```

### Production build (without Docker)

```bash
npm run build
npm start
```

---

## Troubleshooting

### WebAuthn not working

- Use a supported browser (Chrome, Edge, Firefox, Safari)
- WebAuthn requires HTTPS in production (`localhost` is exempted for development)
- On Windows, ensure Windows Hello is enabled in Settings > Accounts > Sign-in options
- Test your browser's WebAuthn support at [webauthn.io](https://webauthn.io)

### Can't log in after registration

1. Clear browser cookies for `localhost`
2. Delete `todos.db` and re-register
3. Check the browser console (F12) for error details

### Port 3000 already in use

```bash
# macOS/Linux
lsof -ti:3000 | xargs kill -9

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Or use a different port
npm run dev -- -p 3001
```

### Database issues

```bash
# Stop the dev server, delete the database, and restart
rm todos.db
npm run dev
```

### npm install fails

```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

---

## Quick Reference

```bash
# Development
npm run dev              # Start dev server
npm run build            # Production build
npm start                # Start production server
npm run lint             # Run ESLint

# Testing
npx playwright test      # Run all E2E tests
npx playwright test --ui # Interactive test UI
npx playwright show-report

# Database
npx tsx scripts/seed-holidays.ts   # Seed holiday data
```

---

## License

Private project — not for redistribution.
