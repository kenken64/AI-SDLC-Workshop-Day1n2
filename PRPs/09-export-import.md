# Export & Import

Backup, transfer, and analyze todos via JSON (full-fidelity, re-importable) and CSV (spreadsheet-friendly, one-way) exports.

**Dependencies**: Reads/writes the `todos` table ([PRP 01](./01-todo-crud-operations.md)), `subtasks` table ([PRP 05](./05-subtasks-progress.md)), and `tags`/`todo_tags` tables ([PRP 06](./06-tag-system.md)). This feature adds **no new database tables** — only two API routes and export/import UI. All operations run within a single authenticated user's scope (`session.userId`).

[← PRP Index](./README.md)

---

## Feature Overview

Users can export all of their todos to a downloadable file for backup, migration between devices/accounts, or offline analysis, and re-import a previously exported JSON file to restore or transfer that data.

Two export formats are supported:
- **JSON** — complete, nested, versioned, and **re-importable**.
- **CSV** — flattened, spreadsheet-friendly (Excel/Sheets/Numbers), and **not re-importable**.

Import only accepts the JSON format produced by this app's own export.

> **Note on source-of-truth resolution**: `USER_GUIDE.md` §11 describes a simplified contract where tags and subtasks are excluded from import. `EVALUATION.md` Feature 09's implementation checklist is more precise and explicit ("Export includes: todos, subtasks, tags, associations", "Tag name conflict resolution (reuse existing)"). This PRP follows `EVALUATION.md`: **subtasks and tag associations ARE included** in both export and import, with tags resolved/reused by name per user. The only thing that is never preserved across an import is the **original database ID** of a todo, subtask, or tag — new IDs are always assigned on import (both sources agree here).

---

## User Stories

- **As a user**, I want to export all my todos to a JSON file so I can keep a personal backup in case something goes wrong.
- **As a user**, I want to export my todos to CSV so I can open them in a spreadsheet and build a pivot table of completion rates by priority/tag.
- **As a user**, I want to import a previously exported JSON file so I can restore my todos after a data loss, or bring them into a new account.
- **As a user switching devices**, I want to export from device A and import on device B so my task list follows me without needing account sync.
- **As a cautious user**, I want the import to fail loudly with a clear error message if I pick the wrong file, rather than silently corrupting my todo list.

---

## User Flow

### Export (JSON)
1. User clicks **"Export JSON"** (green button, top-right toolbar).
2. Client issues `GET /api/todos/export?format=json`.
3. Browser downloads `todos-YYYY-MM-DD.json` (Singapore date) immediately — no confirmation modal.

### Export (CSV)
1. User clicks **"Export CSV"** (dark green button, top-right toolbar).
2. Client issues `GET /api/todos/export?format=csv`.
3. Browser downloads `todos-YYYY-MM-DD.csv`.

### Import
1. User clicks **"Import"** (blue button, top-right toolbar).
2. Native file picker opens, filtered to `.json`.
3. User selects a file exported from this app.
4. Client reads the file, `POST`s its contents as the request body to `/api/todos/import`.
5. Server validates structure, then creates todos (+ subtasks + tag associations) inside a single transaction.
6. On success: todo list refreshes automatically, banner shows `"Successfully imported X todos"`.
7. On failure: no partial writes occur; an error banner shows a specific message (see Edge Cases).

---

## Technical Requirements

### Database Schema

No new tables. This feature composes existing tables:

```sql
-- from PRP 01
-- todos(id, user_id, title, completed, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes, last_notification_sent, created_at, updated_at)

-- from PRP 05
-- subtasks(id, todo_id, title, completed, position, created_at)

-- from PRP 06
-- tags(id, user_id, name, color, created_at) -- UNIQUE(user_id, name)
-- todo_tags(todo_id, tag_id) -- PRIMARY KEY(todo_id, tag_id)
```

### Types

```typescript
// lib/db.ts (existing types, referenced not redefined)
import { Priority, RecurrencePattern, Todo, Subtask, Tag } from '@/lib/db';

// New: export envelope
export interface TodoExport {
  version: 1;
  exported_at: string; // ISO 8601, Singapore local time
  todos: TodoExportItem[];
}

export interface TodoExportItem
  extends Omit<Todo, 'id' | 'user_id' | 'updated_at' | 'last_notification_sent'> {
  subtasks: Array<Omit<Subtask, 'id' | 'todo_id' | 'created_at'>>;
  tags: Array<Pick<Tag, 'name' | 'color'>>;
}

export interface ImportResult {
  imported: number;
  tagsCreated: number;
  tagsReused: number;
}
```

### API Endpoints

#### `GET /api/todos/export?format={json|csv}`

```typescript
// app/api/todos/export/route.ts
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const format = request.nextUrl.searchParams.get('format') ?? 'json';
  const todos = todoDB.findAllWithRelations(session.userId); // includes subtasks + tags

  const dateStr = formatSingaporeDate(getSingaporeNow(), 'yyyy-MM-dd');

  if (format === 'csv') {
    const csv = toCsv(todos);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="todos-${dateStr}.csv"`,
      },
    });
  }

  const payload: TodoExport = {
    version: 1,
    exported_at: getSingaporeNow().toISOString(),
    todos: todos.map(toExportItem),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="todos-${dateStr}.json"`,
    },
  });
}
```

CSV column order (fixed): `ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder`. Values containing a comma, quote, or newline must be wrapped in double quotes with internal quotes doubled (RFC 4180). `ID` in the CSV is the export-time database ID, shown for human reference only — it is never used for re-import (CSV is not importable).

#### `POST /api/todos/import`

```typescript
// app/api/todos/import/route.ts
import { z } from 'zod';

const importSchema = z.object({
  version: z.literal(1),
  exported_at: z.string(),
  todos: z.array(
    z.object({
      title: z.string().min(1),
      completed: z.boolean(),
      due_date: z.string().nullable(),
      priority: z.enum(['high', 'medium', 'low']),
      is_recurring: z.boolean(),
      recurrence_pattern: z.enum(['daily', 'weekly', 'monthly', 'yearly']).nullable(),
      reminder_minutes: z.number().int().nullable(),
      created_at: z.string(),
      subtasks: z.array(
        z.object({ title: z.string().min(1), completed: z.boolean(), position: z.number().int() })
      ),
      tags: z.array(z.object({ name: z.string().min(1), color: z.string() })),
    })
  ),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Failed to import todos. Please check the file format.' },
      { status: 400 }
    );
  }

  try {
    const result = todoDB.importAll(session.userId, parsed.data.todos);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Import failed:', error);
    throw new Error('Failed to import todos');
  }
}
```

### Database Layer (`lib/db.ts`)

`todoDB.importAll` runs as a single `better-sqlite3` transaction so a failure partway through rolls back cleanly (no partial import):

```typescript
importAll(userId: number, items: TodoExportItem[]): ImportResult {
  let tagsCreated = 0;
  let tagsReused = 0;

  const run = db.transaction((items: TodoExportItem[]) => {
    for (const item of items) {
      const todoId = insertTodo.run({ ...item, user_id: userId }).lastInsertRowid as number;

      item.subtasks.forEach((s, i) => {
        insertSubtask.run({ ...s, todo_id: todoId, position: s.position ?? i });
      });

      for (const tag of item.tags) {
        // case-insensitive match to avoid "Work" / "work" duplicates
        const existing = findTagByNameCI.get(userId, tag.name) as { id: number } | undefined;
        const tagId = existing
          ? (tagsReused++, existing.id)
          : (tagsCreated++, insertTag.run({ ...tag, user_id: userId }).lastInsertRowid as number);
        linkTodoTag.run(todoId, tagId);
      }
    }
  });

  run(items);
  return { imported: items.length, tagsCreated, tagsReused };
}
```

Test file: `tests/11-export-import.spec.ts`.

---

## UI Components

```tsx
// app/page.tsx (excerpt) — toolbar buttons
function ExportImportToolbar({ onImported }: { onImported: () => void }) {
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const download = (format: 'json' | 'csv') => {
    window.location.href = `/api/todos/export?format=${format}`;
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setMessage(null);
    try {
      const text = await file.text();
      const body = JSON.parse(text); // throws on invalid JSON before hitting the network
      const res = await fetch('/api/todos/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to import todos');
      setMessage({ type: 'success', text: `Successfully imported ${data.imported} todos` });
      onImported();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof SyntaxError ? 'Invalid JSON format' : (err as Error).message,
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex gap-2 items-center">
      <button onClick={() => download('json')} className="btn-export-json">Export JSON</button>
      <button onClick={() => download('csv')} className="btn-export-csv">Export CSV</button>
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={importing}
        className="btn-import"
      >
        {importing ? 'Importing…' : 'Import'}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFile}
      />
      {message && (
        <span className={message.type === 'success' ? 'text-green-600' : 'text-red-600'}>
          {message.text}
        </span>
      )}
    </div>
  );
}
```

---

## Edge Cases

- **File exported from a different app / malformed structure**: schema validation rejects it before any DB write → `"Failed to import todos. Please check the file format."`
- **Empty `todos` array**: valid input, imports 0 todos, still reports success (`"Successfully imported 0 todos"`), not treated as an error.
- **Importing the same file twice**: by design, creates duplicate todos (import never merges/upserts against existing data). This is expected behavior, not a bug — call it out in the UI copy ("Import creates new todos and does not merge with existing ones") per `USER_GUIDE.md` import tips.
- **Tag name conflicts on import**: matching is **case-insensitive** (`"Work"` and `"work"` resolve to the same tag) to avoid accidental duplicate tags; the color of the *existing* tag wins over the imported color when reusing.
- **CSV values containing commas/quotes/newlines** (e.g., a todo titled `Buy milk, eggs, "bread"`): must be RFC 4180 quoted/escaped, or the CSV is corrupted when opened in Excel/Sheets.
- **Very large import files**: no hard size limit is enforced per spec, but the whole import runs in one transaction and one request body — flag files over ~10MB in the UI as "this may take a while" rather than silently timing out; do not stream-parse (JSON is validated as a whole document via zod).
- **CSV export attempted for import**: CSV is never accepted by the import file picker (`accept="application/json,.json"`) and the import schema requires `version: 1`, which CSV cannot satisfy — reinforces "CSV is one-way."
- **Recurring/reminder fields with invalid enum values** in a hand-edited JSON file: rejected by the zod schema, same generic format error (no need to leak which field failed).
- **Subtask `position` gaps or duplicates** in the imported file: re-normalized to array index order on insert rather than trusted verbatim.

---

## Acceptance Criteria

- [ ] `GET /api/todos/export?format=json` returns a valid `TodoExport` envelope (`version: 1`) containing all of the current user's todos, each with nested `subtasks` and `tags`.
- [ ] `GET /api/todos/export?format=csv` returns RFC 4180-valid CSV with the exact column order `ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder`.
- [ ] Exported JSON filename is `todos-YYYY-MM-DD.json` and CSV is `todos-YYYY-MM-DD.csv`, dated in Singapore time.
- [ ] `POST /api/todos/import` rejects syntactically invalid JSON with `"Invalid JSON format"`.
- [ ] `POST /api/todos/import` rejects structurally invalid/missing-field JSON with `"Failed to import todos. Please check the file format."`.
- [ ] A valid import creates new todos (new IDs), preserves title/completed/due_date/priority/recurrence/reminder fields, and reports `"Successfully imported X todos"`.
- [ ] Imported subtasks are correctly linked to their new parent todo IDs, in original order.
- [ ] Imported tags reuse an existing same-named (case-insensitive) tag for that user instead of creating a duplicate; otherwise a new tag is created.
- [ ] Import never partially writes data on failure (transactional — all or nothing).
- [ ] Import never overwrites or merges with existing todos — it only ever adds new ones.
- [ ] Only the endpoints in this PRP require authentication via `session.userId`; a request without a valid session returns `401`.

---

## Testing Requirements

**E2E (`tests/11-export-import.spec.ts`, Playwright)**
- [ ] Export JSON downloads a file matching the `todos-YYYY-MM-DD.json` naming pattern.
- [ ] Export CSV downloads a file matching the `todos-YYYY-MM-DD.csv` naming pattern.
- [ ] Import a previously exported JSON file → todos appear in the list immediately, success banner shown with correct count.
- [ ] Import an invalid (non-JSON) file → error banner `"Invalid JSON format"`.
- [ ] Import a structurally invalid JSON (e.g., missing `todos` array) → error banner about file format.
- [ ] Round-trip: create todos with subtasks and tags → export JSON → delete all todos → import same file → verify subtasks and tags are restored and correctly associated.
- [ ] Import the same file twice → verify todo count doubles (duplication is expected, not deduped).

**Unit tests**
- [ ] ID-remapping: given an import payload with subtasks/tags, `importAll` assigns new todo/subtask/tag IDs and preserves parent-child linkage.
- [ ] Tag conflict resolution: importing a tag name that already exists (including case-differing) reuses the existing tag ID and does not create a new row; a genuinely new tag name creates exactly one new row.
- [ ] CSV serialization: a title containing `,`, `"`, and `\n` round-trips through the CSV writer as valid RFC 4180 output.
- [ ] Zod schema: valid payload passes; payloads with wrong enum values, wrong types, or missing required fields are rejected.
- [ ] Date formatting: export filename date matches Singapore calendar date even when server UTC date differs (e.g., near midnight SGT).

---

## Out of Scope

- Merge/upsert-on-import (matching existing todos by title or due date to update instead of duplicating).
- Scheduled or automatic backups (e.g., nightly export to cloud storage).
- Importing from other apps' export formats (Todoist, Things, Apple Reminders, etc.).
- Partial/selective import (choosing a subset of todos from a file to import).
- Conflict resolution UI (e.g., a diff/merge screen before import completes) — import is all-or-nothing and immediate.
- Exporting/importing templates (see [PRP 07](./07-template-system.md)) or saved filter presets (see [PRP 08](./08-search-filtering.md)) — this PRP covers todos only.

---

## Success Metrics

- 100% relationship fidelity on round-trip export → delete → import (every subtask and tag association is restored) for lists up to 500 todos.
- Zero duplicate tag rows created across repeated imports of files sharing tag names (case-insensitive match rate: 100%).
- Import of a 500-todo file completes in under 5 seconds on the reference dev environment.
- Zero partial-write incidents (transaction failure always results in 0 rows written, never a partial set).
