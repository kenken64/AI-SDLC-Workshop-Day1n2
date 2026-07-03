import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'todos.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initSchema(_db);
  }
  return _db;
}

const SYSTEM_USER_ID = 1;

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'medium',
      due_date TEXT,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      recurrence_pattern TEXT,
      reminder_minutes INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );
  `);

  // Migrations — safe to run repeatedly
  const cols = (db.prepare("PRAGMA table_info(todos)").all() as { name: string }[]).map(c => c.name);
  if (!cols.includes('is_recurring')) {
    db.exec("ALTER TABLE todos ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0");
  }
  if (!cols.includes('recurrence_pattern')) {
    db.exec("ALTER TABLE todos ADD COLUMN recurrence_pattern TEXT");
  }
  if (!cols.includes('completed_at')) {
    db.exec("ALTER TABLE todos ADD COLUMN completed_at TEXT");
  }
  if (!cols.includes('reminder_minutes')) {
    db.exec("ALTER TABLE todos ADD COLUMN reminder_minutes INTEGER");
  }
}

export { SYSTEM_USER_ID };

// ─── Types ────────────────────────────────────────────────────────────────────

export type Priority = 'high' | 'medium' | 'low';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: number;                      // 0 | 1 (SQLite)
  priority: Priority;
  due_date: string | null;
  is_recurring: number;                   // 0 | 1
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CreateTodoInput {
  title: string;
  priority?: Priority;
  due_date?: string | null;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
}

export interface UpdateTodoInput {
  title?: string;
  priority?: Priority;
  due_date?: string | null;
  completed?: boolean;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
}

// ─── Todo DB ──────────────────────────────────────────────────────────────────

export const todoDB = {
  findAll(): Todo[] {
    return getDb()
      .prepare(
        `SELECT * FROM todos
         ORDER BY
           CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
           due_date ASC NULLS LAST,
           created_at DESC`
      )
      .all() as Todo[];
  },

  findById(id: number): Todo | undefined {
    return getDb().prepare('SELECT * FROM todos WHERE id = ?').get(id) as Todo | undefined;
  },

  create(input: CreateTodoInput): Todo {
    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO todos (user_id, title, priority, due_date, is_recurring, recurrence_pattern, reminder_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        SYSTEM_USER_ID,
        input.title,
        input.priority ?? 'medium',
        input.due_date ?? null,
        input.is_recurring ? 1 : 0,
        input.recurrence_pattern ?? null,
        input.reminder_minutes ?? null
      );
    return db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid) as Todo;
  },

  update(id: number, input: UpdateTodoInput): Todo | undefined {
    const db = getDb();
    const current = db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as Todo | undefined;
    if (!current) return undefined;

    const now = new Date().toISOString();
    const completedAt =
      input.completed === true ? now
      : input.completed === false ? null
      : current.completed_at;

    db.prepare(
      `UPDATE todos SET
        title = ?,
        priority = ?,
        due_date = ?,
        completed = ?,
        is_recurring = ?,
        recurrence_pattern = ?,
        reminder_minutes = ?,
        completed_at = ?,
        updated_at = ?
       WHERE id = ?`
    ).run(
      input.title ?? current.title,
      input.priority ?? current.priority,
      'due_date' in input ? (input.due_date ?? null) : current.due_date,
      input.completed !== undefined ? (input.completed ? 1 : 0) : current.completed,
      input.is_recurring !== undefined ? (input.is_recurring ? 1 : 0) : current.is_recurring,
      'recurrence_pattern' in input ? (input.recurrence_pattern ?? null) : current.recurrence_pattern,
      'reminder_minutes' in input ? (input.reminder_minutes ?? null) : current.reminder_minutes,
      completedAt,
      now,
      id
    );

    return db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as Todo;
  },

  delete(id: number): boolean {
    const result = getDb().prepare('DELETE FROM todos WHERE id = ?').run(id);
    return result.changes > 0;
  },
};
