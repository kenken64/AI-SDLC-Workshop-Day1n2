import Database from "better-sqlite3";
import path from "node:path";
import { calculateNextDueDate } from "@/lib/timezone";

const databasePath = path.join(process.cwd(), "todos.db");
const db = new Database(databasePath, { timeout: 5000 });

db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    due_date TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    recurrence_pattern TEXT,
    reminder_minutes INTEGER,
    last_notification_sent TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS subtasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#6B7280'
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS todo_tags (
    todo_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (todo_id, tag_id),
    FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    subtasks_json TEXT NOT NULL DEFAULT '[]',
    due_date_offset_days INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// ── Auth tables ────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    current_challenge TEXT,
    created_at TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS authenticators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    credential_id TEXT NOT NULL UNIQUE,
    credential_public_key TEXT NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    transports TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Migrations for existing databases
try { db.exec(`ALTER TABLE todos ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium';`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE todos ADD COLUMN recurrence_pattern TEXT;`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE todos ADD COLUMN reminder_minutes INTEGER;`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE todos ADD COLUMN last_notification_sent TEXT;`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE todos ADD COLUMN user_id INTEGER REFERENCES users(id);`); } catch { /* exists */ }

// ── Types ──────────────────────────────────────────────────────────────

export type Priority = "high" | "medium" | "low";
export type RecurrencePattern = "daily" | "weekly" | "monthly" | "yearly";
export const REMINDER_OPTIONS = [15, 30, 60, 120, 1440, 2880, 10080] as const;
export type ReminderMinutes = (typeof REMINDER_OPTIONS)[number];

export type Todo = {
  id: number;
  title: string;
  description: string | null;
  priority: Priority;
  recurrence_pattern: RecurrencePattern | null;
  due_date: string | null;
  completed: 0 | 1;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  updated_at: string;
};

export type Subtask = {
  id: number;
  todo_id: number;
  title: string;
  completed: 0 | 1;
  position: number;
  created_at: string;
};

export type Tag = {
  id: number;
  name: string;
  color: string;
};

export type TemplateSubtask = {
  title: string;
  position: number;
};

export type Template = {
  id: number;
  title: string;
  description: string | null;
  priority: Priority;
  subtasks_json: string;
  due_date_offset_days: number | null;
  created_at: string;
  updated_at: string;
};

type TodoInput = {
  title: string;
  description?: string | null;
  priority?: Priority;
  recurrence_pattern?: RecurrencePattern | null;
  due_date?: string | null;
  reminder_minutes?: number | null;
};

type TodoUpdateInput = {
  title?: string;
  description?: string | null;
  priority?: Priority;
  recurrence_pattern?: RecurrencePattern | null;
  due_date?: string | null;
  completed?: boolean;
  reminder_minutes?: number | null;
};

// ── Todo prepared statements ───────────────────────────────────────────

const getAllStmt = db.prepare(`
  SELECT id, title, description, priority, recurrence_pattern, due_date, completed,
         reminder_minutes, last_notification_sent, created_at, updated_at
  FROM todos
  ORDER BY
    CASE priority
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      ELSE 3
    END ASC,
    datetime(created_at) DESC;
`);

const getByIdStmt = db.prepare(`
  SELECT id, title, description, priority, recurrence_pattern, due_date, completed,
         reminder_minutes, last_notification_sent, created_at, updated_at
  FROM todos
  WHERE id = ?;
`);

const createStmt = db.prepare(`
  INSERT INTO todos (title, description, priority, recurrence_pattern, due_date, reminder_minutes, completed, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?);
`);

const updateStmt = db.prepare(`
  UPDATE todos
  SET
    title = ?,
    description = ?,
    priority = ?,
    recurrence_pattern = ?,
    due_date = ?,
    completed = ?,
    reminder_minutes = ?,
    last_notification_sent = ?,
    updated_at = ?
  WHERE id = ?;
`);

const deleteStmt = db.prepare(`
  DELETE FROM todos
  WHERE id = ?;
`);

const dueRemindersStmt = db.prepare(`
  SELECT id, title, description, priority, recurrence_pattern, due_date, completed,
         reminder_minutes, last_notification_sent, created_at, updated_at
  FROM todos
  WHERE completed = 0
    AND reminder_minutes IS NOT NULL
    AND due_date IS NOT NULL
    AND last_notification_sent IS NULL
    AND datetime(due_date, '-' || reminder_minutes || ' minutes') <= datetime(?);
`);

const dismissReminderStmt = db.prepare(`
  UPDATE todos SET last_notification_sent = ? WHERE id = ?;
`);

const completeRecurringTx = db.transaction(
  (id: number, nowIso: string): { current: Todo; next: Todo } | undefined => {
    const current = getByIdStmt.get(id) as Todo | undefined;

    if (!current) {
      return undefined;
    }

    const completedResult = updateStmt.run(
      current.title,
      current.description,
      current.priority,
      current.recurrence_pattern,
      current.due_date,
      1,
      current.reminder_minutes,
      current.last_notification_sent,
      nowIso,
      id,
    );

    if (completedResult.changes === 0) {
      return undefined;
    }

    const nextDueDate = calculateNextDueDate(
      current.due_date ?? nowIso,
      current.recurrence_pattern as RecurrencePattern,
    );

    const insertResult = createStmt.run(
      current.title,
      current.description,
      current.priority,
      current.recurrence_pattern,
      nextDueDate,
      current.reminder_minutes,
      nowIso,
      nowIso,
    );

    const updatedCurrent = getByIdStmt.get(id) as Todo;
    const nextTodo = getByIdStmt.get(
      Number(insertResult.lastInsertRowid),
    ) as Todo;

    return { current: updatedCurrent, next: nextTodo };
  },
);

export const todoDB = {
  list(): (Todo & { tags: Tag[] })[] {
    const todos = getAllStmt.all() as Todo[];
    return todos.map((todo) => ({
      ...todo,
      tags: tagsForTodoStmt.all(todo.id) as Tag[],
    }));
  },

  getById(id: number): Todo | undefined {
    return getByIdStmt.get(id) as Todo | undefined;
  },

  create(input: TodoInput, nowIso: string): Todo {
    const result = createStmt.run(
      input.title,
      input.description ?? null,
      input.priority ?? "medium",
      input.recurrence_pattern ?? null,
      input.due_date ?? null,
      input.reminder_minutes ?? null,
      nowIso,
      nowIso,
    );

    return this.getById(Number(result.lastInsertRowid)) as Todo;
  },

  update(id: number, input: TodoUpdateInput, nowIso: string): Todo | undefined {
    const existing = this.getById(id);

    if (!existing) {
      return undefined;
    }

    const title = input.title ?? existing.title;
    const description =
      input.description === undefined
        ? existing.description
        : input.description;
    const priority = input.priority ?? existing.priority;
    const recurrencePattern =
      input.recurrence_pattern === undefined
        ? existing.recurrence_pattern
        : input.recurrence_pattern;
    const dueDate =
      input.due_date === undefined ? existing.due_date : input.due_date;
    const completed =
      typeof input.completed === "boolean"
        ? input.completed
          ? 1
          : 0
        : existing.completed;

    const reminderMinutes =
      input.reminder_minutes === undefined
        ? existing.reminder_minutes
        : input.reminder_minutes;

    // Reset notification state when reminder_minutes changes
    const lastNotificationSent =
      input.reminder_minutes !== undefined &&
      input.reminder_minutes !== existing.reminder_minutes
        ? null
        : existing.last_notification_sent;

    const result = updateStmt.run(
      title,
      description,
      priority,
      recurrencePattern,
      dueDate,
      completed,
      reminderMinutes,
      lastNotificationSent,
      nowIso,
      id,
    );

    if (result.changes === 0) {
      return undefined;
    }

    return this.getById(id);
  },

  delete(id: number): boolean {
    const result = deleteStmt.run(id);
    return result.changes > 0;
  },

  completeRecurring(
    id: number,
    nowIso: string,
  ): { current: Todo; next: Todo } | undefined {
    return completeRecurringTx(id, nowIso);
  },

  getDueReminders(nowIso: string): Todo[] {
    return dueRemindersStmt.all(nowIso) as Todo[];
  },

  dismissReminder(id: number, nowIso: string): boolean {
    const result = dismissReminderStmt.run(nowIso, id);
    return result.changes > 0;
  },
};

// ── Subtask prepared statements & CRUD ─────────────────────────────────

const subtasksByTodoStmt = db.prepare(`
  SELECT id, todo_id, title, completed, position, created_at
  FROM subtasks WHERE todo_id = ? ORDER BY position ASC;
`);

const subtaskByIdStmt = db.prepare(`
  SELECT id, todo_id, title, completed, position, created_at
  FROM subtasks WHERE id = ?;
`);

const subtaskMaxPositionStmt = db.prepare(`
  SELECT COALESCE(MAX(position), -1) AS max_pos FROM subtasks WHERE todo_id = ?;
`);

const createSubtaskStmt = db.prepare(`
  INSERT INTO subtasks (todo_id, title, completed, position, created_at)
  VALUES (?, ?, 0, ?, ?);
`);

const updateSubtaskStmt = db.prepare(`
  UPDATE subtasks SET title = ?, completed = ?, position = ? WHERE id = ?;
`);

const deleteSubtaskStmt = db.prepare(`DELETE FROM subtasks WHERE id = ?;`);

export const subtaskDB = {
  listByTodo(todoId: number): Subtask[] {
    return subtasksByTodoStmt.all(todoId) as Subtask[];
  },

  getById(id: number): Subtask | undefined {
    return subtaskByIdStmt.get(id) as Subtask | undefined;
  },

  create(
    todoId: number,
    title: string,
    nowIso: string,
  ): Subtask {
    const { max_pos } = subtaskMaxPositionStmt.get(todoId) as { max_pos: number };
    const result = createSubtaskStmt.run(todoId, title, max_pos + 1, nowIso);
    return this.getById(Number(result.lastInsertRowid)) as Subtask;
  },

  update(
    id: number,
    input: { title?: string; completed?: boolean; position?: number },
  ): Subtask | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    const title = input.title ?? existing.title;
    const completed =
      typeof input.completed === "boolean"
        ? input.completed ? 1 : 0
        : existing.completed;
    const position = input.position ?? existing.position;

    const result = updateSubtaskStmt.run(title, completed, position, id);
    if (result.changes === 0) return undefined;
    return this.getById(id);
  },

  delete(id: number): boolean {
    return deleteSubtaskStmt.run(id).changes > 0;
  },
};

// ── Tag prepared statements & CRUD ─────────────────────────────────────

const allTagsStmt = db.prepare(`SELECT id, name, color FROM tags ORDER BY name;`);
const tagByIdStmt = db.prepare(`SELECT id, name, color FROM tags WHERE id = ?;`);
const tagByNameStmt = db.prepare(`SELECT id, name, color FROM tags WHERE LOWER(name) = LOWER(?);`);
const createTagStmt = db.prepare(`INSERT INTO tags (name, color) VALUES (?, ?);`);
const updateTagStmt = db.prepare(`UPDATE tags SET name = ?, color = ? WHERE id = ?;`);
const deleteTagStmt = db.prepare(`DELETE FROM tags WHERE id = ?;`);
const addTodoTagStmt = db.prepare(`INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?);`);
const removeTodoTagStmt = db.prepare(`DELETE FROM todo_tags WHERE todo_id = ? AND tag_id = ?;`);
const tagsForTodoStmt = db.prepare(`
  SELECT t.id, t.name, t.color FROM tags t
  INNER JOIN todo_tags tt ON tt.tag_id = t.id
  WHERE tt.todo_id = ?
  ORDER BY t.name;
`);

export const tagDB = {
  list(): Tag[] {
    return allTagsStmt.all() as Tag[];
  },

  getById(id: number): Tag | undefined {
    return tagByIdStmt.get(id) as Tag | undefined;
  },

  getByName(name: string): Tag | undefined {
    return tagByNameStmt.get(name) as Tag | undefined;
  },

  create(name: string, color: string): Tag {
    const result = createTagStmt.run(name, color);
    return this.getById(Number(result.lastInsertRowid)) as Tag;
  },

  update(id: number, input: { name?: string; color?: string }): Tag | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;
    const name = input.name ?? existing.name;
    const color = input.color ?? existing.color;
    updateTagStmt.run(name, color, id);
    return this.getById(id);
  },

  delete(id: number): boolean {
    return deleteTagStmt.run(id).changes > 0;
  },

  addToTodo(todoId: number, tagId: number): void {
    addTodoTagStmt.run(todoId, tagId);
  },

  removeFromTodo(todoId: number, tagId: number): boolean {
    return removeTodoTagStmt.run(todoId, tagId).changes > 0;
  },

  getTagsForTodo(todoId: number): Tag[] {
    return tagsForTodoStmt.all(todoId) as Tag[];
  },
};

// ── Template prepared statements & CRUD ────────────────────────────────

const allTemplatesStmt = db.prepare(`
  SELECT id, title, description, priority, subtasks_json, due_date_offset_days, created_at, updated_at
  FROM templates ORDER BY created_at DESC, id DESC;
`);
const templateByIdStmt = db.prepare(`
  SELECT id, title, description, priority, subtasks_json, due_date_offset_days, created_at, updated_at
  FROM templates WHERE id = ?;
`);
const createTemplateStmt = db.prepare(`
  INSERT INTO templates (title, description, priority, subtasks_json, due_date_offset_days, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?);
`);
const updateTemplateStmt = db.prepare(`
  UPDATE templates SET title = ?, description = ?, priority = ?, subtasks_json = ?, due_date_offset_days = ?, updated_at = ?
  WHERE id = ?;
`);
const deleteTemplateStmt = db.prepare(`DELETE FROM templates WHERE id = ?;`);

export const templateDB = {
  list(): Template[] {
    return allTemplatesStmt.all() as Template[];
  },

  getById(id: number): Template | undefined {
    return templateByIdStmt.get(id) as Template | undefined;
  },

  create(
    input: {
      title: string;
      description?: string | null;
      priority?: Priority;
      subtasks?: TemplateSubtask[];
      due_date_offset_days?: number | null;
    },
    nowIso: string,
  ): Template {
    const result = createTemplateStmt.run(
      input.title,
      input.description ?? null,
      input.priority ?? "medium",
      JSON.stringify(input.subtasks ?? []),
      input.due_date_offset_days ?? null,
      nowIso,
      nowIso,
    );
    return this.getById(Number(result.lastInsertRowid)) as Template;
  },

  update(
    id: number,
    input: {
      title?: string;
      description?: string | null;
      priority?: Priority;
      subtasks?: TemplateSubtask[];
      due_date_offset_days?: number | null;
    },
    nowIso: string,
  ): Template | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    const title = input.title ?? existing.title;
    const description =
      input.description === undefined ? existing.description : input.description;
    const priority = input.priority ?? existing.priority;
    const subtasksJson =
      input.subtasks !== undefined
        ? JSON.stringify(input.subtasks)
        : existing.subtasks_json;
    const offsetDays =
      input.due_date_offset_days === undefined
        ? existing.due_date_offset_days
        : input.due_date_offset_days;

    updateTemplateStmt.run(title, description, priority, subtasksJson, offsetDays, nowIso, id);
    return this.getById(id);
  },

  delete(id: number): boolean {
    return deleteTemplateStmt.run(id).changes > 0;
  },
};

// ── User & Authenticator types ─────────────────────────────────────────

export type User = {
  id: number;
  username: string;
  current_challenge: string | null;
  created_at: string;
};

export type Authenticator = {
  id: number;
  user_id: number;
  credential_id: string;
  credential_public_key: string;
  counter: number;
  transports: string | null;
  created_at: string;
};

// ── User prepared statements & CRUD ────────────────────────────────────

const userByIdStmt = db.prepare(`SELECT * FROM users WHERE id = ?;`);
const userByUsernameStmt = db.prepare(`SELECT * FROM users WHERE username = ?;`);
const createUserStmt = db.prepare(
  `INSERT INTO users (username, current_challenge, created_at) VALUES (?, ?, ?);`,
);
const updateChallengeStmt = db.prepare(
  `UPDATE users SET current_challenge = ? WHERE id = ?;`,
);

export const userDB = {
  getById(id: number): User | undefined {
    return userByIdStmt.get(id) as User | undefined;
  },

  getByUsername(username: string): User | undefined {
    return userByUsernameStmt.get(username) as User | undefined;
  },

  create(username: string, nowIso: string): User {
    const result = createUserStmt.run(username, null, nowIso);
    return this.getById(Number(result.lastInsertRowid)) as User;
  },

  setChallenge(userId: number, challenge: string | null): void {
    updateChallengeStmt.run(challenge, userId);
  },
};

// ── Authenticator prepared statements & CRUD ───────────────────────────

const authsByUserStmt = db.prepare(
  `SELECT * FROM authenticators WHERE user_id = ?;`,
);
const authByCredIdStmt = db.prepare(
  `SELECT * FROM authenticators WHERE credential_id = ?;`,
);
const createAuthStmt = db.prepare(
  `INSERT INTO authenticators (user_id, credential_id, credential_public_key, counter, transports, created_at)
   VALUES (?, ?, ?, ?, ?, ?);`,
);
const updateAuthCounterStmt = db.prepare(
  `UPDATE authenticators SET counter = ? WHERE id = ?;`,
);

export const authenticatorDB = {
  getByUserId(userId: number): Authenticator[] {
    return authsByUserStmt.all(userId) as Authenticator[];
  },

  getByCredentialId(credentialId: string): Authenticator | undefined {
    return authByCredIdStmt.get(credentialId) as Authenticator | undefined;
  },

  create(
    userId: number,
    credentialId: string,
    publicKey: string,
    counter: number,
    transports: string | null,
    nowIso: string,
  ): Authenticator {
    const result = createAuthStmt.run(
      userId,
      credentialId,
      publicKey,
      counter,
      transports,
      nowIso,
    );
    return authByCredIdStmt.get(credentialId) as Authenticator;
  },

  updateCounter(id: number, counter: number): void {
    updateAuthCounterStmt.run(counter, id);
  },
};
