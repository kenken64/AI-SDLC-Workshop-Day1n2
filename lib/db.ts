import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { createIdMap, ImportPayload } from "@/lib/importExport";
import { isRecurringPattern, RecurrencePattern, nextRecurringDueDate } from "@/lib/recurrence";
import { getSingaporeDateKey, getSingaporeNow } from "@/lib/timezone";

export type Priority = "high" | "medium" | "low";

export interface User {
  id: string;
  username: string;
  current_challenge: string | null;
  challenge_expires_at: string | null;
  created_at: string;
}

export interface Authenticator {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number | null;
  transports: string | null;
  created_at: string;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Subtask {
  id: string;
  todo_id: string;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
}

export interface Todo {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  priority: Priority;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  updated_at: string;
}

export interface TodoWithDetails extends Todo {
  subtasks: Subtask[];
  tags: Tag[];
}

export interface Template {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: string | null;
  title: string;
  priority: Priority;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  due_date_offset_minutes: number | null;
  subtasks_json: string;
  created_at: string;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
}

interface TodoRow extends Omit<Todo, "completed"> {
  completed: number;
}

interface SubtaskRow extends Omit<Subtask, "completed"> {
  completed: number;
}

const dataPath = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.cwd();
fs.mkdirSync(dataPath, { recursive: true });

const dbPath = path.join(dataPath, "todos.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    current_challenge TEXT,
    challenge_expires_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS authenticators (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    counter INTEGER DEFAULT 0,
    transports TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'medium',
    recurrence_pattern TEXT,
    reminder_minutes INTEGER,
    last_notification_sent TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS subtasks (
    id TEXT PRIMARY KEY,
    todo_id TEXT NOT NULL,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS todo_tags (
    todo_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (todo_id, tag_id),
    FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    title TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    recurrence_pattern TEXT,
    reminder_minutes INTEGER,
    due_date_offset_minutes INTEGER,
    subtasks_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_authenticators_user ON authenticators(user_id);
  CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id);
  CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
  CREATE INDEX IF NOT EXISTS idx_subtasks_todo ON subtasks(todo_id);
  CREATE INDEX IF NOT EXISTS idx_tags_user ON tags(user_id);
  CREATE INDEX IF NOT EXISTS idx_templates_user ON templates(user_id);
`);

function nowIso(): string {
  return getSingaporeNow().toISOString();
}

function makeId(): string {
  return crypto.randomUUID();
}

function mapTodo(row: TodoRow): Todo {
  return {
    ...row,
    completed: row.completed === 1,
    recurrence_pattern: isRecurringPattern(row.recurrence_pattern) ? row.recurrence_pattern : null,
  };
}

function mapSubtask(row: SubtaskRow): Subtask {
  return {
    ...row,
    completed: row.completed === 1,
  };
}

function attachRelations(todoRows: TodoRow[]): TodoWithDetails[] {
  if (todoRows.length === 0) {
    return [];
  }

  const todoIds = todoRows.map((todo) => todo.id);
  const placeholders = todoIds.map(() => "?").join(",");

  const subtaskRows = db
    .prepare(`SELECT * FROM subtasks WHERE todo_id IN (${placeholders}) ORDER BY position ASC, created_at ASC`)
    .all(...todoIds) as SubtaskRow[];

  const tagRows = db
    .prepare(
      `
        SELECT t.*, tt.todo_id
        FROM tags t
        JOIN todo_tags tt ON tt.tag_id = t.id
        WHERE tt.todo_id IN (${placeholders})
      `,
    )
    .all(...todoIds) as (Tag & { todo_id: string })[];

  const subtasksByTodoId = new Map<string, Subtask[]>();
  const tagsByTodoId = new Map<string, Tag[]>();

  for (const row of subtaskRows) {
    const items = subtasksByTodoId.get(row.todo_id) || [];
    items.push(mapSubtask(row));
    subtasksByTodoId.set(row.todo_id, items);
  }

  for (const row of tagRows) {
    const items = tagsByTodoId.get(row.todo_id) || [];
    items.push({
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      color: row.color,
      created_at: row.created_at,
    });
    tagsByTodoId.set(row.todo_id, items);
  }

  return todoRows.map((row) => ({
    ...mapTodo(row),
    subtasks: subtasksByTodoId.get(row.id) || [],
    tags: tagsByTodoId.get(row.id) || [],
  }));
}

export const userDB = {
  findByUsername(username: string): User | null {
    const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as User | undefined;
    return row || null;
  },

  findById(userId: string): User | null {
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as User | undefined;
    return row || null;
  },

  create(username: string): User {
    const user: User = {
      id: makeId(),
      username,
      current_challenge: null,
      challenge_expires_at: null,
      created_at: nowIso(),
    };

    db.prepare(
      "INSERT INTO users (id, username, current_challenge, challenge_expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(user.id, user.username, user.current_challenge, user.challenge_expires_at, user.created_at);

    return user;
  },

  saveChallenge(userId: string, challenge: string): void {
    db.prepare("UPDATE users SET current_challenge = ?, challenge_expires_at = ? WHERE id = ?").run(
      challenge,
      new Date(Date.now() + 5 * 60_000).toISOString(),
      userId,
    );
  },

  clearChallenge(userId: string): void {
    db.prepare("UPDATE users SET current_challenge = NULL, challenge_expires_at = NULL WHERE id = ?").run(userId);
  },
};

export const authenticatorDB = {
  listByUserId(userId: string): Authenticator[] {
    return db.prepare("SELECT * FROM authenticators WHERE user_id = ?").all(userId) as Authenticator[];
  },

  findByCredentialId(credentialId: string): Authenticator | null {
    const row = db
      .prepare("SELECT * FROM authenticators WHERE credential_id = ?")
      .get(credentialId) as Authenticator | undefined;
    return row || null;
  },

  create(input: Omit<Authenticator, "id" | "created_at">): Authenticator {
    const authenticator: Authenticator = {
      id: makeId(),
      created_at: nowIso(),
      ...input,
    };

    db.prepare(
      "INSERT INTO authenticators (id, user_id, credential_id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      authenticator.id,
      authenticator.user_id,
      authenticator.credential_id,
      authenticator.public_key,
      authenticator.counter,
      authenticator.transports,
      authenticator.created_at,
    );

    return authenticator;
  },

  updateCounter(id: string, counter: number): void {
    db.prepare("UPDATE authenticators SET counter = ? WHERE id = ?").run(counter, id);
  },
};

export const todoDB = {
  listByUser(userId: string, options?: { includeCompleted?: boolean; month?: string }): TodoWithDetails[] {
    const includeCompleted = options?.includeCompleted ?? true;
    const values: string[] = [userId];

    const where: string[] = ["user_id = ?"];
    if (!includeCompleted) {
      where.push("completed = 0");
    }

    if (options?.month) {
      where.push("substr(due_date, 1, 7) = ?");
      values.push(options.month);
    }

    const rows = db
      .prepare(
        `
          SELECT *
          FROM todos
          WHERE ${where.join(" AND ")}
          ORDER BY
            CASE priority
              WHEN 'high' THEN 1
              WHEN 'medium' THEN 2
              ELSE 3
            END ASC,
            CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,
            due_date ASC,
            created_at DESC
        `,
      )
      .all(...values) as TodoRow[];

    return attachRelations(rows);
  },

  findById(userId: string, id: string): TodoWithDetails | null {
    const row = db.prepare("SELECT * FROM todos WHERE user_id = ? AND id = ?").get(userId, id) as TodoRow | undefined;
    if (!row) {
      return null;
    }

    return attachRelations([row])[0] || null;
  },

  create(
    userId: string,
    input: {
      title: string;
      description?: string | null;
      due_date?: string | null;
      priority: Priority;
      recurrence_pattern?: RecurrencePattern | null;
      reminder_minutes?: number | null;
      tag_ids?: string[];
    },
  ): TodoWithDetails {
    const id = makeId();
    const now = nowIso();

    db.prepare(
      `
        INSERT INTO todos (
          id, user_id, title, description, due_date, completed, priority,
          recurrence_pattern, reminder_minutes, last_notification_sent, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, ?, ?)
      `,
    ).run(
      id,
      userId,
      input.title,
      input.description || null,
      input.due_date || null,
      input.priority,
      input.recurrence_pattern || null,
      input.reminder_minutes || null,
      now,
      now,
    );

    if (input.tag_ids?.length) {
      const statement = db.prepare("INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)");
      for (const tagId of input.tag_ids) {
        statement.run(id, tagId);
      }
    }

    return this.findById(userId, id) as TodoWithDetails;
  },

  update(
    userId: string,
    id: string,
    patch: {
      title?: string;
      description?: string | null;
      due_date?: string | null;
      completed?: boolean;
      priority?: Priority;
      recurrence_pattern?: RecurrencePattern | null;
      reminder_minutes?: number | null;
      tag_ids?: string[];
    },
    options?: {
      skipRecurrenceSideEffects?: boolean;
    },
  ): TodoWithDetails | null {
    const existing = this.findById(userId, id);
    if (!existing) {
      return null;
    }

    const updates: string[] = ["updated_at = ?"];
    const values: Array<string | number | null> = [nowIso()];

    if (patch.title !== undefined) {
      updates.push("title = ?");
      values.push(patch.title);
    }

    if (patch.description !== undefined) {
      updates.push("description = ?");
      values.push(patch.description);
    }

    if (patch.due_date !== undefined) {
      updates.push("due_date = ?");
      values.push(patch.due_date);
    }

    if (patch.completed !== undefined) {
      updates.push("completed = ?");
      values.push(patch.completed ? 1 : 0);
    }

    if (patch.priority !== undefined) {
      updates.push("priority = ?");
      values.push(patch.priority);
    }

    if (patch.recurrence_pattern !== undefined) {
      updates.push("recurrence_pattern = ?");
      values.push(patch.recurrence_pattern);
    }

    if (patch.reminder_minutes !== undefined) {
      updates.push("reminder_minutes = ?");
      values.push(patch.reminder_minutes);
      updates.push("last_notification_sent = NULL");
    }

    db.prepare(`UPDATE todos SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`).run(...values, id, userId);

    if (patch.tag_ids) {
      db.prepare("DELETE FROM todo_tags WHERE todo_id = ?").run(id);
      const statement = db.prepare("INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)");
      for (const tagId of patch.tag_ids) {
        statement.run(id, tagId);
      }
    }

    const updated = this.findById(userId, id);

    const becameCompleted = !existing.completed && patch.completed === true;
    const shouldCreateRecurrence = !options?.skipRecurrenceSideEffects;
    if (shouldCreateRecurrence && becameCompleted && updated?.recurrence_pattern && updated.due_date) {
      this.createRecurringNext(updated);
    }

    return updated;
  },

  delete(userId: string, id: string): boolean {
    const result = db.prepare("DELETE FROM todos WHERE id = ? AND user_id = ?").run(id, userId);
    return result.changes > 0;
  },

  createRecurringNext(todo: TodoWithDetails): TodoWithDetails {
    if (!todo.recurrence_pattern || !todo.due_date) {
      throw new Error("Recurring todo requires recurrence pattern and due date");
    }

    const nextDueDate = nextRecurringDueDate(todo.due_date, todo.recurrence_pattern);
    const nextTodo = this.create(todo.user_id, {
      title: todo.title,
      description: todo.description,
      due_date: nextDueDate,
      priority: todo.priority,
      recurrence_pattern: todo.recurrence_pattern,
      reminder_minutes: todo.reminder_minutes,
      tag_ids: todo.tags.map((tag) => tag.id),
    });

    return nextTodo;
  },

  addTag(userId: string, todoId: string, tagId: string): void {
    const todo = db.prepare("SELECT id FROM todos WHERE id = ? AND user_id = ?").get(todoId, userId) as
      | { id: string }
      | undefined;
    const tag = db.prepare("SELECT id FROM tags WHERE id = ? AND user_id = ?").get(tagId, userId) as
      | { id: string }
      | undefined;

    if (!todo || !tag) {
      throw new Error("Todo or tag not found");
    }

    db.prepare("INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)").run(todoId, tagId);
  },

  removeTag(userId: string, todoId: string, tagId: string): void {
    const todo = db.prepare("SELECT id FROM todos WHERE id = ? AND user_id = ?").get(todoId, userId) as
      | { id: string }
      | undefined;
    if (!todo) {
      throw new Error("Todo not found");
    }

    db.prepare("DELETE FROM todo_tags WHERE todo_id = ? AND tag_id = ?").run(todoId, tagId);
  },

  listDueNotifications(userId: string): Todo[] {
    const now = getSingaporeNow();
    const rows = db
      .prepare(
        `
          SELECT *
          FROM todos
          WHERE user_id = ?
            AND completed = 0
            AND due_date IS NOT NULL
            AND reminder_minutes IS NOT NULL
        `,
      )
      .all(userId) as TodoRow[];

    const dueRows = rows.filter((row) => {
      if (!row.due_date || row.reminder_minutes === null) {
        return false;
      }

      const due = new Date(row.due_date);
      const reminderAt = new Date(due.getTime() - row.reminder_minutes * 60_000);

      if (reminderAt.getTime() > now.getTime()) {
        return false;
      }

      if (row.last_notification_sent) {
        const last = new Date(row.last_notification_sent);
        if (last.getTime() >= reminderAt.getTime()) {
          return false;
        }
      }

      return true;
    });

    return dueRows.map(mapTodo);
  },

  markNotificationSent(todoIds: string[]): void {
    if (todoIds.length === 0) {
      return;
    }

    const placeholders = todoIds.map(() => "?").join(",");
    db.prepare(`UPDATE todos SET last_notification_sent = ?, updated_at = ? WHERE id IN (${placeholders})`).run(
      nowIso(),
      nowIso(),
      ...todoIds,
    );
  },
};

export const subtaskDB = {
  create(userId: string, todoId: string, title: string): Subtask {
    const todo = db.prepare("SELECT id FROM todos WHERE id = ? AND user_id = ?").get(todoId, userId) as
      | { id: string }
      | undefined;
    if (!todo) {
      throw new Error("Todo not found");
    }

    const currentPositionRow = db
      .prepare("SELECT COALESCE(MAX(position), -1) AS max_position FROM subtasks WHERE todo_id = ?")
      .get(todoId) as { max_position: number };

    const row: Subtask = {
      id: makeId(),
      todo_id: todoId,
      title,
      completed: false,
      position: currentPositionRow.max_position + 1,
      created_at: nowIso(),
    };

    db.prepare(
      "INSERT INTO subtasks (id, todo_id, title, completed, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(row.id, row.todo_id, row.title, row.completed ? 1 : 0, row.position, row.created_at);

    return row;
  },

  update(
    userId: string,
    subtaskId: string,
    patch: {
      title?: string;
      completed?: boolean;
      position?: number;
    },
  ): Subtask | null {
    const existing = db
      .prepare(
        `
          SELECT s.*
          FROM subtasks s
          JOIN todos t ON t.id = s.todo_id
          WHERE s.id = ? AND t.user_id = ?
        `,
      )
      .get(subtaskId, userId) as SubtaskRow | undefined;

    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const values: Array<string | number> = [];

    if (patch.title !== undefined) {
      updates.push("title = ?");
      values.push(patch.title);
    }

    if (patch.completed !== undefined) {
      updates.push("completed = ?");
      values.push(patch.completed ? 1 : 0);
    }

    if (patch.position !== undefined) {
      updates.push("position = ?");
      values.push(patch.position);
    }

    if (updates.length > 0) {
      db.prepare(`UPDATE subtasks SET ${updates.join(", ")} WHERE id = ?`).run(...values, subtaskId);
    }

    const updated = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(subtaskId) as SubtaskRow;
    return mapSubtask(updated);
  },

  delete(userId: string, subtaskId: string): boolean {
    const result = db
      .prepare(
        `
          DELETE FROM subtasks
          WHERE id = ?
            AND todo_id IN (SELECT id FROM todos WHERE user_id = ?)
        `,
      )
      .run(subtaskId, userId);

    return result.changes > 0;
  },
};

export const tagDB = {
  listByUser(userId: string): Tag[] {
    return db.prepare("SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC").all(userId) as Tag[];
  },

  findById(userId: string, id: string): Tag | null {
    const row = db.prepare("SELECT * FROM tags WHERE user_id = ? AND id = ?").get(userId, id) as Tag | undefined;
    return row || null;
  },

  findByName(userId: string, name: string): Tag | null {
    const row = db.prepare("SELECT * FROM tags WHERE user_id = ? AND name = ?").get(userId, name) as Tag | undefined;
    return row || null;
  },

  create(userId: string, name: string, color: string): Tag {
    const row: Tag = {
      id: makeId(),
      user_id: userId,
      name,
      color,
      created_at: nowIso(),
    };

    db.prepare("INSERT INTO tags (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)").run(
      row.id,
      row.user_id,
      row.name,
      row.color,
      row.created_at,
    );

    return row;
  },

  update(userId: string, id: string, patch: { name?: string; color?: string }): Tag | null {
    const existing = this.findById(userId, id);
    if (!existing) {
      return null;
    }

    const nextName = patch.name ?? existing.name;
    const nextColor = patch.color ?? existing.color;

    db.prepare("UPDATE tags SET name = ?, color = ? WHERE user_id = ? AND id = ?").run(nextName, nextColor, userId, id);

    return this.findById(userId, id);
  },

  delete(userId: string, id: string): boolean {
    const result = db.prepare("DELETE FROM tags WHERE user_id = ? AND id = ?").run(userId, id);
    return result.changes > 0;
  },
};

export const templateDB = {
  listByUser(userId: string): Template[] {
    return db.prepare("SELECT * FROM templates WHERE user_id = ? ORDER BY created_at DESC").all(userId) as Template[];
  },

  findById(userId: string, id: string): Template | null {
    const row = db
      .prepare("SELECT * FROM templates WHERE user_id = ? AND id = ?")
      .get(userId, id) as Template | undefined;
    return row || null;
  },

  create(
    userId: string,
    input: {
      name: string;
      description?: string | null;
      category?: string | null;
      title: string;
      priority: Priority;
      recurrence_pattern?: RecurrencePattern | null;
      reminder_minutes?: number | null;
      due_date_offset_minutes?: number | null;
      subtasks_json: string;
    },
  ): Template {
    const template: Template = {
      id: makeId(),
      user_id: userId,
      name: input.name,
      description: input.description || null,
      category: input.category || null,
      title: input.title,
      priority: input.priority,
      recurrence_pattern: input.recurrence_pattern || null,
      reminder_minutes: input.reminder_minutes || null,
      due_date_offset_minutes: input.due_date_offset_minutes || null,
      subtasks_json: input.subtasks_json,
      created_at: nowIso(),
    };

    db.prepare(
      `
        INSERT INTO templates (
          id, user_id, name, description, category, title,
          priority, recurrence_pattern, reminder_minutes, due_date_offset_minutes,
          subtasks_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      template.id,
      template.user_id,
      template.name,
      template.description,
      template.category,
      template.title,
      template.priority,
      template.recurrence_pattern,
      template.reminder_minutes,
      template.due_date_offset_minutes,
      template.subtasks_json,
      template.created_at,
    );

    return template;
  },

  update(
    userId: string,
    id: string,
    patch: Partial<Omit<Template, "id" | "user_id" | "created_at">>,
  ): Template | null {
    const existing = this.findById(userId, id);
    if (!existing) {
      return null;
    }

    const next = {
      ...existing,
      ...patch,
    };

    db.prepare(
      `
        UPDATE templates
        SET name = ?, description = ?, category = ?, title = ?, priority = ?,
            recurrence_pattern = ?, reminder_minutes = ?, due_date_offset_minutes = ?, subtasks_json = ?
        WHERE user_id = ? AND id = ?
      `,
    ).run(
      next.name,
      next.description,
      next.category,
      next.title,
      next.priority,
      next.recurrence_pattern,
      next.reminder_minutes,
      next.due_date_offset_minutes,
      next.subtasks_json,
      userId,
      id,
    );

    return this.findById(userId, id);
  },

  delete(userId: string, id: string): boolean {
    const result = db.prepare("DELETE FROM templates WHERE user_id = ? AND id = ?").run(userId, id);
    return result.changes > 0;
  },

  useTemplate(userId: string, templateId: string): TodoWithDetails {
    const template = this.findById(userId, templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    const dueDate =
      template.due_date_offset_minutes !== null
        ? new Date(getSingaporeNow().getTime() + template.due_date_offset_minutes * 60_000).toISOString()
        : null;

    const todo = todoDB.create(userId, {
      title: template.title,
      description: template.description,
      due_date: dueDate,
      priority: template.priority,
      recurrence_pattern: template.recurrence_pattern,
      reminder_minutes: template.reminder_minutes,
      tag_ids: [],
    });

    const subtasks = JSON.parse(template.subtasks_json) as Array<{ title: string; position: number }>;
    for (const subtask of subtasks) {
      const created = subtaskDB.create(userId, todo.id, subtask.title);
      if (created.position !== subtask.position) {
        subtaskDB.update(userId, created.id, { position: subtask.position });
      }
    }

    return todoDB.findById(userId, todo.id) as TodoWithDetails;
  },
};

export const holidayDB = {
  listByMonth(month: string): Holiday[] {
    return db
      .prepare("SELECT * FROM holidays WHERE substr(date, 1, 7) = ? ORDER BY date ASC")
      .all(month) as Holiday[];
  },

  upsertMany(rows: Array<{ date: string; name: string }>): void {
    const statement = db.prepare("INSERT INTO holidays (date, name) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET name=excluded.name");
    const transaction = db.transaction((items: Array<{ date: string; name: string }>) => {
      for (const item of items) {
        statement.run(item.date, item.name);
      }
    });

    transaction(rows);
  },
};

export const exportImportDB = {
  exportUserData(userId: string): {
    version: "1.0";
    todos: Todo[];
    subtasks: Subtask[];
    tags: Tag[];
    todo_tags: Array<{ todo_id: string; tag_id: string }>;
  } {
    const todos = db.prepare("SELECT * FROM todos WHERE user_id = ? ORDER BY created_at ASC").all(userId) as TodoRow[];
    const todoIds = todos.map((todo) => todo.id);

    const subtasks =
      todoIds.length > 0
        ? (db
            .prepare(`SELECT * FROM subtasks WHERE todo_id IN (${todoIds.map(() => "?").join(",")}) ORDER BY created_at ASC`)
            .all(...todoIds) as SubtaskRow[])
        : [];

    const tags = db.prepare("SELECT * FROM tags WHERE user_id = ? ORDER BY created_at ASC").all(userId) as Tag[];

    const todoTags =
      todoIds.length > 0
        ? (db
            .prepare(`SELECT * FROM todo_tags WHERE todo_id IN (${todoIds.map(() => "?").join(",")})`)
            .all(...todoIds) as Array<{ todo_id: string; tag_id: string }>)
        : [];

    return {
      version: "1.0",
      todos: todos.map(mapTodo),
      subtasks: subtasks.map(mapSubtask),
      tags,
      todo_tags: todoTags,
    };
  },

  importUserData(userId: string, payload: ImportPayload): { todos: number; subtasks: number; tags: number } {
    const idMap = createIdMap();

    const transaction = db.transaction(() => {
      for (const sourceTag of payload.tags) {
        const existing = tagDB.findByName(userId, sourceTag.name);
        if (existing) {
          idMap.tags.set(sourceTag.id, existing.id);
          continue;
        }

        const created = tagDB.create(userId, sourceTag.name, sourceTag.color);
        idMap.tags.set(sourceTag.id, created.id);
      }

      for (const sourceTodo of payload.todos) {
        const created = todoDB.create(userId, {
          title: sourceTodo.title,
          description: sourceTodo.description,
          due_date: sourceTodo.due_date,
          priority: sourceTodo.priority,
          recurrence_pattern: sourceTodo.recurrence_pattern,
          reminder_minutes: sourceTodo.reminder_minutes,
          tag_ids: [],
        });

        todoDB.update(userId, created.id, {
          completed: sourceTodo.completed,
        }, { skipRecurrenceSideEffects: true });

        idMap.todos.set(sourceTodo.id, created.id);
      }

      for (const sourceSubtask of payload.subtasks) {
        const mappedTodoId = idMap.todos.get(sourceSubtask.todo_id);
        if (!mappedTodoId) {
          continue;
        }

        const created = subtaskDB.create(userId, mappedTodoId, sourceSubtask.title);
        subtaskDB.update(userId, created.id, {
          completed: sourceSubtask.completed,
          position: sourceSubtask.position,
        });
      }

      for (const relation of payload.todo_tags) {
        const mappedTodoId = idMap.todos.get(relation.todo_id);
        const mappedTagId = idMap.tags.get(relation.tag_id);
        if (!mappedTodoId || !mappedTagId) {
          continue;
        }

        todoDB.addTag(userId, mappedTodoId, mappedTagId);
      }
    });

    transaction();

    return {
      todos: payload.todos.length,
      subtasks: payload.subtasks.length,
      tags: payload.tags.length,
    };
  },
};

export function getTodoProgress(todo: TodoWithDetails): { completed: number; total: number; percentage: number } {
  const total = todo.subtasks.length;
  const completed = todo.subtasks.filter((item) => item.completed).length;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percentage };
}

export function splitTodosByStatus(todos: TodoWithDetails[]): {
  overdue: TodoWithDetails[];
  active: TodoWithDetails[];
  completed: TodoWithDetails[];
} {
  const todayKey = getSingaporeDateKey(getSingaporeNow());

  const overdue: TodoWithDetails[] = [];
  const active: TodoWithDetails[] = [];
  const completed: TodoWithDetails[] = [];

  for (const todo of todos) {
    if (todo.completed) {
      completed.push(todo);
      continue;
    }

    if (todo.due_date) {
      const dueDateKey = getSingaporeDateKey(todo.due_date);
      if (dueDateKey < todayKey || new Date(todo.due_date).getTime() < getSingaporeNow().getTime()) {
        overdue.push(todo);
        continue;
      }
    }

    active.push(todo);
  }

  return {
    overdue,
    active,
    completed,
  };
}
