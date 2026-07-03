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

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS authenticators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id TEXT UNIQUE NOT NULL,
      credential_public_key BLOB NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'medium',
      due_date TEXT,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      recurrence_pattern TEXT,
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
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type Priority = 'high' | 'medium' | 'low';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

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
  transports: string | null;
  created_at: string;
}

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: number; // 0 | 1 (SQLite)
  priority: Priority;
  due_date: string | null;
  is_recurring: number; // 0 | 1
  recurrence_pattern: RecurrencePattern | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CreateTodoInput {
  userId: number;
  title: string;
  priority?: Priority;
  due_date?: string | null;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
}

export interface UpdateTodoInput {
  title?: string;
  priority?: Priority;
  due_date?: string | null;
  completed?: boolean;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
}

// ─── User DB ──────────────────────────────────────────────────────────────────

export const userDB = {
  findByUsername(username: string): User | undefined {
    return getDb().prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
  },

  findById(id: number): User | undefined {
    return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
  },

  create(username: string): User {
    const result = getDb().prepare('INSERT INTO users (username) VALUES (?)').run(username);
    return getDb().prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as User;
  },
};

// ─── Authenticator DB ─────────────────────────────────────────────────────────

export const authenticatorDB = {
  findByCredentialId(credentialId: string): Authenticator | undefined {
    return getDb()
      .prepare('SELECT * FROM authenticators WHERE credential_id = ?')
      .get(credentialId) as Authenticator | undefined;
  },

  findByUserId(userId: number): Authenticator[] {
    return getDb()
      .prepare('SELECT * FROM authenticators WHERE user_id = ?')
      .all(userId) as Authenticator[];
  },

  create(data: {
    userId: number;
    credentialId: string;
    credentialPublicKey: Buffer;
    counter: number;
    transports?: string;
  }): void {
    getDb()
      .prepare(
        'INSERT INTO authenticators (user_id, credential_id, credential_public_key, counter, transports) VALUES (?, ?, ?, ?, ?)'
      )
      .run(
        data.userId,
        data.credentialId,
        data.credentialPublicKey,
        data.counter,
        data.transports ?? null
      );
  },

  updateCounter(credentialId: string, counter: number): void {
    getDb()
      .prepare('UPDATE authenticators SET counter = ? WHERE credential_id = ?')
      .run(counter, credentialId);
  },
};

// ─── Todo DB ──────────────────────────────────────────────────────────────────

export const todoDB = {
  findByUserId(userId: number): Todo[] {
    return getDb()
      .prepare(
        `SELECT * FROM todos WHERE user_id = ?
         ORDER BY
           CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
           due_date ASC NULLS LAST,
           created_at DESC`
      )
      .all(userId) as Todo[];
  },

  findById(id: number): Todo | undefined {
    return getDb().prepare('SELECT * FROM todos WHERE id = ?').get(id) as Todo | undefined;
  },

  create(input: CreateTodoInput): Todo {
    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO todos (user_id, title, priority, due_date, is_recurring, recurrence_pattern)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.userId,
        input.title,
        input.priority ?? 'medium',
        input.due_date ?? null,
        input.is_recurring ? 1 : 0,
        input.recurrence_pattern ?? null
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
