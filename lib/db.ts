/**
 * lib/db.ts — single source of truth for all database interfaces and CRUD.
 *
 * Technology: better-sqlite3 (synchronous — NO async/await for DB calls).
 * Database file: todos.db in the project root.
 *
 * Owner: Person A (Wave 1). Every other person imports types and DB objects
 * from this file. Do NOT import this file in client components.
 */

import Database from 'better-sqlite3';
import path from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

export type Priority = 'high' | 'medium' | 'low';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type ReminderMinutes = 15 | 30 | 60 | 120 | 1440 | 2880 | 10080;

export const REMINDER_LABELS: Record<ReminderMinutes, string> = {
  15: '15m',
  30: '30m',
  60: '1h',
  120: '2h',
  1440: '1d',
  2880: '2d',
  10080: '1w',
};

export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface Authenticator {
  id: number;
  user_id: number;
  credential_id: string;
  credential_public_key: Buffer;
  counter: number;
  created_at: string;
}

export interface Session {
  userId: number;
  username: string;
}

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

export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
}

export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface Template {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  category: string | null;
  title_template: string;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  due_date_offset_minutes: number | null;
  subtasks_json: string | null;
  created_at: string;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
}

// ─── Database Initialisation ─────────────────────────────────────────────────

const DB_PATH = path.join(process.cwd(), 'todos.db');
const db = new Database(DB_PATH);

// Enforce referential integrity and enable WAL mode for better concurrency.
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    UNIQUE NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS authenticators (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id        TEXT    UNIQUE NOT NULL,
    credential_public_key BLOB   NOT NULL,
    counter              INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_authenticators_user_id ON authenticators(user_id);

  CREATE TABLE IF NOT EXISTS todos (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title                 TEXT    NOT NULL,
    completed             INTEGER NOT NULL DEFAULT 0,
    due_date              TEXT,
    priority              TEXT    NOT NULL DEFAULT 'medium',
    is_recurring          INTEGER NOT NULL DEFAULT 0,
    recurrence_pattern    TEXT,
    reminder_minutes      INTEGER,
    last_notification_sent TEXT,
    created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
  CREATE INDEX IF NOT EXISTS idx_todos_due_date  ON todos(due_date);

  CREATE TABLE IF NOT EXISTS subtasks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_id    INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    title      TEXT    NOT NULL,
    completed  INTEGER NOT NULL DEFAULT 0,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_subtasks_todo_id ON subtasks(todo_id);

  CREATE TABLE IF NOT EXISTS tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    color      TEXT    NOT NULL DEFAULT '#3B82F6',
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, name)
  );

  CREATE TABLE IF NOT EXISTS todo_tags (
    todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (todo_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS templates (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                  TEXT    NOT NULL,
    description           TEXT,
    category              TEXT,
    title_template        TEXT    NOT NULL,
    priority              TEXT    NOT NULL DEFAULT 'medium',
    is_recurring          INTEGER NOT NULL DEFAULT 0,
    recurrence_pattern    TEXT,
    reminder_minutes      INTEGER,
    due_date_offset_minutes INTEGER,
    subtasks_json         TEXT,
    created_at            TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS holidays (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT    NOT NULL,
    name       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
`);

// ─── Row mappers ─────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function toTodo(row: Row): Todo {
  return {
    ...(row as unknown as Todo),
    completed: row.completed === 1,
    is_recurring: row.is_recurring === 1,
  };
}

function toSubtask(row: Row): Subtask {
  return { ...(row as unknown as Subtask), completed: row.completed === 1 };
}

// ─── userDB ──────────────────────────────────────────────────────────────────

export const userDB = {
  findByUsername(username: string): User | undefined {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
  },

  findById(id: number): User | undefined {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
  },

  create(username: string): User {
    return db
      .prepare('INSERT INTO users (username) VALUES (?) RETURNING *')
      .get(username) as User;
  },
};

// ─── authenticatorDB ─────────────────────────────────────────────────────────

export const authenticatorDB = {
  findByCredentialId(credentialId: string): Authenticator | undefined {
    return db
      .prepare('SELECT * FROM authenticators WHERE credential_id = ?')
      .get(credentialId) as Authenticator | undefined;
  },

  findByUserId(userId: number): Authenticator[] {
    return db
      .prepare('SELECT * FROM authenticators WHERE user_id = ? ORDER BY created_at ASC')
      .all(userId) as Authenticator[];
  },

  create(data: {
    user_id: number;
    credential_id: string;
    credential_public_key: Buffer;
    counter: number;
  }): Authenticator {
    return db
      .prepare(
        `INSERT INTO authenticators (user_id, credential_id, credential_public_key, counter)
         VALUES (?, ?, ?, ?) RETURNING *`,
      )
      .get(
        data.user_id,
        data.credential_id,
        data.credential_public_key,
        data.counter,
      ) as Authenticator;
  },

  updateCounter(id: number, counter: number): void {
    db.prepare('UPDATE authenticators SET counter = ? WHERE id = ?').run(counter, id);
  },
};

// ─── todoDB ──────────────────────────────────────────────────────────────────

export const todoDB = {
  findByUserId(userId: number): Todo[] {
    return (
      db
        .prepare('SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC')
        .all(userId) as Row[]
    ).map(toTodo);
  },

  findById(id: number, userId: number): Todo | undefined {
    const row = db
      .prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?')
      .get(id, userId) as Row | undefined;
    return row ? toTodo(row) : undefined;
  },

  findForNotifications(userId: number, now: string): Todo[] {
    // Rows where the reminder window covers `now` and notification not yet sent for this window.
    return (
      db
        .prepare(
          `SELECT * FROM todos
           WHERE user_id = ?
             AND completed = 0
             AND due_date IS NOT NULL
             AND reminder_minutes IS NOT NULL
             AND datetime(due_date, '-' || reminder_minutes || ' minutes') <= ?
             AND (last_notification_sent IS NULL
                  OR last_notification_sent < datetime(due_date, '-' || reminder_minutes || ' minutes'))`,
        )
        .all(userId, now) as Row[]
    ).map(toTodo);
  },

  create(data: {
    user_id: number;
    title: string;
    due_date?: string | null;
    priority?: Priority;
    is_recurring?: boolean;
    recurrence_pattern?: RecurrencePattern | null;
    reminder_minutes?: number | null;
  }): Todo {
    const row = db
      .prepare(
        `INSERT INTO todos
           (user_id, title, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(
        data.user_id,
        data.title,
        data.due_date ?? null,
        data.priority ?? 'medium',
        data.is_recurring ? 1 : 0,
        data.recurrence_pattern ?? null,
        data.reminder_minutes ?? null,
      ) as Row;
    return toTodo(row);
  },

  update(
    id: number,
    userId: number,
    data: Partial<{
      title: string;
      completed: boolean;
      due_date: string | null;
      priority: Priority;
      is_recurring: boolean;
      recurrence_pattern: RecurrencePattern | null;
      reminder_minutes: number | null;
      last_notification_sent: string | null;
    }>,
  ): Todo | undefined {
    const allowed = [
      'title', 'completed', 'due_date', 'priority',
      'is_recurring', 'recurrence_pattern', 'reminder_minutes', 'last_notification_sent',
    ] as const;

    const entries = (Object.entries(data) as [string, unknown][])
      .filter(([k]) => (allowed as readonly string[]).includes(k));

    if (entries.length === 0) return this.findById(id, userId);

    const params: Record<string, unknown> = { id, userId };
    const setParts: string[] = [];

    for (const [k, v] of entries) {
      params[k] = k === 'completed' || k === 'is_recurring' ? (v ? 1 : 0) : (v ?? null);
      setParts.push(`${k} = @${k}`);
    }

    const row = db
      .prepare(
        `UPDATE todos SET ${setParts.join(', ')}, updated_at = datetime('now')
         WHERE id = @id AND user_id = @userId RETURNING *`,
      )
      .get(params) as Row | undefined;
    return row ? toTodo(row) : undefined;
  },

  delete(id: number, userId: number): void {
    db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(id, userId);
  },
};

// ─── subtaskDB ───────────────────────────────────────────────────────────────

export const subtaskDB = {
  findByTodoId(todoId: number): Subtask[] {
    return (
      db
        .prepare('SELECT * FROM subtasks WHERE todo_id = ? ORDER BY position ASC')
        .all(todoId) as Row[]
    ).map(toSubtask);
  },

  findById(id: number): Subtask | undefined {
    const row = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id) as Row | undefined;
    return row ? toSubtask(row) : undefined;
  },

  create(data: { todo_id: number; title: string }): Subtask {
    const { m } = db
      .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM subtasks WHERE todo_id = ?')
      .get(data.todo_id) as { m: number };
    const row = db
      .prepare(
        'INSERT INTO subtasks (todo_id, title, position) VALUES (?, ?, ?) RETURNING *',
      )
      .get(data.todo_id, data.title, m + 1) as Row;
    return toSubtask(row);
  },

  update(id: number, data: { title?: string; completed?: boolean }): Subtask | undefined {
    const params: Record<string, unknown> = { id };
    const setParts: string[] = [];
    if (data.title !== undefined) { params.title = data.title; setParts.push('title = @title'); }
    if (data.completed !== undefined) { params.completed = data.completed ? 1 : 0; setParts.push('completed = @completed'); }
    if (setParts.length === 0) return this.findById(id);
    const row = db
      .prepare(`UPDATE subtasks SET ${setParts.join(', ')} WHERE id = @id RETURNING *`)
      .get(params) as Row | undefined;
    return row ? toSubtask(row) : undefined;
  },

  delete(id: number): void {
    db.prepare('DELETE FROM subtasks WHERE id = ?').run(id);
  },
};

// ─── tagDB ───────────────────────────────────────────────────────────────────

export const tagDB = {
  findByUserId(userId: number): Tag[] {
    return db
      .prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC')
      .all(userId) as Tag[];
  },

  findById(id: number, userId: number): Tag | undefined {
    return db
      .prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?')
      .get(id, userId) as Tag | undefined;
  },

  findByNameCaseInsensitive(userId: number, name: string): Tag | undefined {
    return db
      .prepare('SELECT * FROM tags WHERE user_id = ? AND lower(name) = lower(?)')
      .get(userId, name) as Tag | undefined;
  },

  findByTodoId(todoId: number): Tag[] {
    return db
      .prepare(
        `SELECT t.* FROM tags t
         JOIN todo_tags tt ON tt.tag_id = t.id
         WHERE tt.todo_id = ?
         ORDER BY t.name ASC`,
      )
      .all(todoId) as Tag[];
  },

  create(data: { user_id: number; name: string; color?: string }): Tag {
    return db
      .prepare(
        'INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?) RETURNING *',
      )
      .get(data.user_id, data.name, data.color ?? '#3B82F6') as Tag;
  },

  update(id: number, userId: number, data: { name?: string; color?: string }): Tag | undefined {
    const params: Record<string, unknown> = { id, userId };
    const setParts: string[] = [];
    if (data.name !== undefined)  { params.name  = data.name;  setParts.push('name = @name'); }
    if (data.color !== undefined) { params.color = data.color; setParts.push('color = @color'); }
    if (setParts.length === 0) return this.findById(id, userId);
    return db
      .prepare(`UPDATE tags SET ${setParts.join(', ')} WHERE id = @id AND user_id = @userId RETURNING *`)
      .get(params) as Tag | undefined;
  },

  delete(id: number, userId: number): void {
    db.prepare('DELETE FROM tags WHERE id = ? AND user_id = ?').run(id, userId);
  },

  attachToTodo(todoId: number, tagId: number): void {
    db.prepare('INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)').run(todoId, tagId);
  },

  detachFromTodo(todoId: number, tagId: number): void {
    db.prepare('DELETE FROM todo_tags WHERE todo_id = ? AND tag_id = ?').run(todoId, tagId);
  },
};

// ─── templateDB ──────────────────────────────────────────────────────────────

export const templateDB = {
  findByUserId(userId: number): Template[] {
    return db
      .prepare('SELECT * FROM templates WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Template[];
  },

  findById(id: number, userId: number): Template | undefined {
    return db
      .prepare('SELECT * FROM templates WHERE id = ? AND user_id = ?')
      .get(id, userId) as Template | undefined;
  },

  create(data: {
    user_id: number;
    name: string;
    description?: string | null;
    category?: string | null;
    title_template: string;
    priority?: Priority;
    is_recurring?: boolean;
    recurrence_pattern?: RecurrencePattern | null;
    reminder_minutes?: number | null;
    due_date_offset_minutes?: number | null;
    subtasks_json?: string | null;
  }): Template {
    return db
      .prepare(
        `INSERT INTO templates
           (user_id, name, description, category, title_template, priority,
            is_recurring, recurrence_pattern, reminder_minutes,
            due_date_offset_minutes, subtasks_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(
        data.user_id,
        data.name,
        data.description ?? null,
        data.category ?? null,
        data.title_template,
        data.priority ?? 'medium',
        data.is_recurring ? 1 : 0,
        data.recurrence_pattern ?? null,
        data.reminder_minutes ?? null,
        data.due_date_offset_minutes ?? null,
        data.subtasks_json ?? null,
      ) as Template;
  },

  update(
    id: number,
    userId: number,
    data: Partial<Pick<Template,
      'name' | 'description' | 'category' | 'title_template' | 'priority' |
      'is_recurring' | 'recurrence_pattern' | 'reminder_minutes' |
      'due_date_offset_minutes' | 'subtasks_json'
    >>,
  ): Template | undefined {
    const params: Record<string, unknown> = { id, userId };
    const setParts: string[] = [];
    for (const [k, v] of Object.entries(data)) {
      params[k] = k === 'is_recurring' ? (v ? 1 : 0) : (v ?? null);
      setParts.push(`${k} = @${k}`);
    }
    if (setParts.length === 0) return this.findById(id, userId);
    return db
      .prepare(`UPDATE templates SET ${setParts.join(', ')} WHERE id = @id AND user_id = @userId RETURNING *`)
      .get(params) as Template | undefined;
  },

  delete(id: number, userId: number): void {
    db.prepare('DELETE FROM templates WHERE id = ? AND user_id = ?').run(id, userId);
  },
};

// ─── holidayDB ───────────────────────────────────────────────────────────────

export const holidayDB = {
  findAll(): Holiday[] {
    return db.prepare('SELECT * FROM holidays ORDER BY date ASC').all() as Holiday[];
  },

  findByDateRange(from: string, to: string): Holiday[] {
    return db
      .prepare('SELECT * FROM holidays WHERE date >= ? AND date <= ? ORDER BY date ASC')
      .all(from, to) as Holiday[];
  },

  upsert(date: string, name: string): void {
    db.prepare('INSERT OR REPLACE INTO holidays (date, name) VALUES (?, ?)').run(date, name);
  },
};
