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
  if (!cols.includes('last_notification_sent')) {
    db.exec("ALTER TABLE todos ADD COLUMN last_notification_sent TEXT");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

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
  `);
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
  last_notification_sent: string | null;
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

    const resetNotification = 'due_date' in input || 'reminder_minutes' in input;
    db.prepare(
      `UPDATE todos SET
        title = ?,
        priority = ?,
        due_date = ?,
        completed = ?,
        is_recurring = ?,
        recurrence_pattern = ?,
        reminder_minutes = ?,
        last_notification_sent = ?,
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
      resetNotification ? null : (current.last_notification_sent ?? null),
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

  findDueReminders(userId: number, now: Date): Todo[] {
    return getDb().prepare(`
      SELECT * FROM todos
      WHERE user_id = ?
        AND completed = 0
        AND due_date IS NOT NULL
        AND reminder_minutes IS NOT NULL
        AND last_notification_sent IS NULL
        AND datetime(due_date, '-' || reminder_minutes || ' minutes') <= ?
    `).all(userId, now.toISOString()) as Todo[];
  },

  markNotificationSent(id: number, sentAt: string): void {
    getDb().prepare('UPDATE todos SET last_notification_sent = ? WHERE id = ?').run(sentAt, id);
  },
};

// ─── Subtask Types & DB ───────────────────────────────────────────────────────

export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: number;   // 0 | 1
  position: number;
  created_at: string;
}

export interface CreateSubtaskInput {
  todoId: number;
  title: string;
}

export const subtaskDB = {
  findByTodoId(todoId: number): Subtask[] {
    return getDb()
      .prepare('SELECT * FROM subtasks WHERE todo_id = ? ORDER BY position, created_at')
      .all(todoId) as Subtask[];
  },

  findAll(): Subtask[] {
    return getDb()
      .prepare('SELECT * FROM subtasks ORDER BY todo_id, position, created_at')
      .all() as Subtask[];
  },

  create(input: CreateSubtaskInput): Subtask {
    const db = getDb();
    const maxPos = db
      .prepare('SELECT COALESCE(MAX(position), 0) as m FROM subtasks WHERE todo_id = ?')
      .get(input.todoId) as { m: number };
    const result = db
      .prepare('INSERT INTO subtasks (todo_id, title, position) VALUES (?, ?, ?)')
      .run(input.todoId, input.title, maxPos.m + 1);
    return db.prepare('SELECT * FROM subtasks WHERE id = ?').get(result.lastInsertRowid) as Subtask;
  },

  update(id: number, completed: boolean): Subtask | undefined {
    const db = getDb();
    db.prepare('UPDATE subtasks SET completed = ? WHERE id = ?').run(completed ? 1 : 0, id);
    return db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id) as Subtask | undefined;
  },

  delete(id: number): boolean {
    return getDb().prepare('DELETE FROM subtasks WHERE id = ?').run(id).changes > 0;
  },
};

// ─── Tag Types & DB ───────────────────────────────────────────────────────────

export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface CreateTagInput {
  userId: number;
  name: string;
  color?: string;
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
}

export const tagDB = {
  findByUserId(userId: number): Tag[] {
    return getDb()
      .prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name')
      .all(userId) as Tag[];
  },

  findById(id: number): Tag | undefined {
    return getDb().prepare('SELECT * FROM tags WHERE id = ?').get(id) as Tag | undefined;
  },

  create(input: CreateTagInput): Tag {
    const db = getDb();
    const result = db
      .prepare('INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)')
      .run(input.userId, input.name.trim(), input.color ?? '#3B82F6');
    return db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid) as Tag;
  },

  update(id: number, input: UpdateTagInput): Tag | undefined {
    const db = getDb();
    const current = db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as Tag | undefined;
    if (!current) return undefined;
    db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?').run(
      input.name ?? current.name,
      input.color ?? current.color,
      id
    );
    return db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as Tag;
  },

  delete(id: number): boolean {
    return getDb().prepare('DELETE FROM tags WHERE id = ?').run(id).changes > 0;
  },

  setTodoTags(todoId: number, tagIds: number[]): void {
    const db = getDb();
    const deleteStmt = db.prepare('DELETE FROM todo_tags WHERE todo_id = ?');
    const insertStmt = db.prepare('INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)');
    db.transaction(() => {
      deleteStmt.run(todoId);
      for (const tagId of tagIds) insertStmt.run(todoId, tagId);
    })();
  },

  getTagsForTodo(todoId: number): Tag[] {
    return getDb().prepare(`
      SELECT tags.* FROM tags
      JOIN todo_tags ON todo_tags.tag_id = tags.id
      WHERE todo_tags.todo_id = ?
      ORDER BY tags.name
    `).all(todoId) as Tag[];
  },

  findWithTodoIds(): (Tag & { todo_id: number })[] {
    return getDb().prepare(`
      SELECT tags.*, todo_tags.todo_id
      FROM tags
      JOIN todo_tags ON todo_tags.tag_id = tags.id
      ORDER BY tags.name
    `).all() as (Tag & { todo_id: number })[];
  },
};
