# PRP 09 — Export & Import

## Feature Overview

Users can export their todos in two formats: **JSON** (complete, re-importable) and **CSV** (spreadsheet-friendly, read-only). JSON exports include todos, subtasks, and tag associations. Importing a JSON file creates new todos under the current user, remapping IDs to prevent conflicts. Tags and subtasks are recreated with new IDs. Tags are matched by name; new tags are created if they don't exist.

---

## User Stories

| Persona | Story | Acceptance Criteria |
|---------|-------|---------------------|
| Backup manager | As a user, I want to export all my todos as JSON so I have a complete backup | JSON file downloads with all todos and relationships |
| Analyst | As a user, I want to export todos as CSV so I can analyse them in a spreadsheet | CSV file downloads with one row per todo |
| Migration user | As a user, I want to import a JSON backup to restore my todos | Imported todos appear in the list with new IDs |
| Transfer user | As a user, I want to import todos exported from another account | Tags remapped/created by name; todos assigned to importing user |

---

## User Flow

### JSON Export
1. User clicks **Export JSON** button (green, top-right)
2. File downloads automatically: `todos-YYYY-MM-DD.json`
3. File contains complete data: todos + subtasks + tags + tag associations

### CSV Export
1. User clicks **Export CSV** button (dark green, top-right)
2. File downloads: `todos-YYYY-MM-DD.csv`
3. One row per todo; subtasks summarised as count

### Import
1. User clicks **Import** button (blue, top-right)
2. Browser file picker opens — `.json` files only
3. User selects a previously exported JSON file
4. File parsed and validated
5. New todos created (with new IDs) for importing user
6. Subtasks and tag associations recreated
7. Success message: "Successfully imported X todos"

---

## Technical Requirements

### Export API (`app/api/todos/export/route.ts`)

```typescript
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const format = new URL(request.url).searchParams.get('format') ?? 'json';
  const todos = todoDB.findByUserId(session.userId);

  if (format === 'csv') {
    const csv = buildCSV(todos);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="todos-${getDateString()}.csv"`,
      },
    });
  }

  // JSON: include subtasks and tags
  const enriched = todos.map(todo => ({
    ...todo,
    subtasks: subtaskDB.findByTodoId(todo.id),
    tags: tagDB.getTagsForTodo(todo.id).map(t => ({ name: t.name, color: t.color })),
  }));

  return new NextResponse(JSON.stringify(enriched, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="todos-${getDateString()}.json"`,
    },
  });
}

function getDateString(): string {
  return getSingaporeNow().toISOString().slice(0, 10);
}
```

### JSON Export Format

```json
[
  {
    "id": 1,
    "title": "Sample Todo",
    "completed": 0,
    "priority": "high",
    "due_date": "2025-11-10T14:00",
    "is_recurring": 0,
    "recurrence_pattern": null,
    "reminder_minutes": 60,
    "created_at": "2025-11-02T10:30:00",
    "subtasks": [
      { "title": "Step 1", "completed": 0, "position": 1 }
    ],
    "tags": [
      { "name": "Work", "color": "#3B82F6" }
    ]
  }
]
```

### CSV Export Format

```
ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder,Subtasks
1,"Sample Todo",false,"2025-11-10T14:00","high",false,,60,1
```

```typescript
function buildCSV(todos: Todo[]): string {
  const headers = ['ID', 'Title', 'Completed', 'Due Date', 'Priority', 'Recurring', 'Pattern', 'Reminder'];
  const rows = todos.map(t => [
    t.id,
    `"${t.title.replace(/"/g, '""')}"`,
    t.completed ? 'true' : 'false',
    t.due_date ?? '',
    t.priority,
    t.is_recurring ? 'true' : 'false',
    t.recurrence_pattern ?? '',
    t.reminder_minutes ?? '',
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}
```

### Import API (`app/api/todos/import/route.ts`)

```typescript
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const body = await request.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid format: expected array' }, { status: 400 });
    }

    let count = 0;

    for (const item of body) {
      // Validate required fields
      if (!item.title || typeof item.title !== 'string') continue;

      // Create todo (new ID assigned)
      const todo = todoDB.create({
        userId: session.userId,
        title: item.title,
        priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium',
        due_date: item.due_date ?? null,
        is_recurring: !!item.is_recurring,
        recurrence_pattern: item.recurrence_pattern ?? null,
        reminder_minutes: item.reminder_minutes ?? null,
      });

      // Restore completed state
      if (item.completed) {
        todoDB.update(todo.id, { completed: true });
      }

      // Recreate subtasks
      if (Array.isArray(item.subtasks)) {
        for (const sub of item.subtasks) {
          if (sub.title) subtaskDB.create({ todoId: todo.id, title: sub.title });
        }
      }

      // Recreate tags (match by name, create if missing)
      if (Array.isArray(item.tags)) {
        const tagIds: number[] = [];
        for (const tagData of item.tags) {
          if (!tagData.name) continue;
          let tag = tagDB.findByUserAndName(session.userId, tagData.name);
          if (!tag) {
            tag = tagDB.create({ userId: session.userId, name: tagData.name, color: tagData.color ?? '#3B82F6' });
          }
          tagIds.push(tag.id);
        }
        if (tagIds.length) tagDB.setTodoTags(todo.id, tagIds);
      }

      count++;
    }

    return NextResponse.json({ message: `Successfully imported ${count} todos`, count });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Failed to import todos. Please check the file format.' }, { status: 400 });
  }
}
```

### Additional DB Operation Needed

```typescript
// tagDB
findByUserAndName(userId: number, name: string): Tag | undefined {
  return db.prepare(
    'SELECT * FROM tags WHERE user_id = ? AND name = ?'
  ).get(userId, name) as Tag | undefined;
},
```

---

## UI Components

### Export / Import Buttons

```tsx
{/* JSON export */}
<button
  onClick={() => window.location.href = '/api/todos/export?format=json'}
  className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
>
  Export JSON
</button>

{/* CSV export */}
<button
  onClick={() => window.location.href = '/api/todos/export?format=csv'}
  className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
>
  Export CSV
</button>

{/* Import */}
<label className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg cursor-pointer">
  Import
  <input
    type="file"
    accept=".json"
    className="hidden"
    onChange={handleImport}
  />
</label>
```

### Import Handler

```typescript
async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    const res = await fetch('/api/todos/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);

    setSuccess(result.message);
    await fetchTodos(); // Refresh list
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Import failed');
  } finally {
    e.target.value = ''; // Reset file input
  }
}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Invalid JSON file | Caught by `JSON.parse` catch block → `400` error |
| Item missing title | Skipped (not counted in import total) |
| Invalid priority value | Defaults to `'medium'` |
| Tag name already exists | Reuses existing tag (no duplicate created) |
| Import creates duplicates | Expected — import always creates new todos |
| Very large file (> 1000 todos) | Processed in a transaction for performance |
| CSV import | Not supported — only JSON; return `400` if non-JSON |

---

## Acceptance Criteria

- [ ] **Export JSON** downloads `todos-YYYY-MM-DD.json` with all todos
- [ ] JSON export includes subtasks array and tags array per todo
- [ ] **Export CSV** downloads `todos-YYYY-MM-DD.csv` with one row per todo
- [ ] **Import** opens file picker filtered to `.json` files
- [ ] Importing valid JSON creates todos with new IDs for current user
- [ ] Subtasks are recreated from import data
- [ ] Tags matched by name; new tags created if name not found
- [ ] Success message shows count: "Successfully imported X todos"
- [ ] Invalid JSON shows error: "Failed to import todos. Please check the file format."
- [ ] Exported then re-imported todos are functionally identical

---

## Testing Requirements

### E2E Tests (`tests/10-export-import.spec.ts`)

```typescript
test('export JSON and re-import round-trips correctly', async ({ page }) => {
  await helpers.createTodo(page, { title: 'Export me', priority: 'high' });

  // Download export
  const download = await page.waitForEvent('download', async () => {
    await page.getByRole('button', { name: 'Export JSON' }).click();
  });
  const exportPath = await download.path();

  // Import back
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(exportPath!);
  await expect(page.getByText(/Successfully imported/)).toBeVisible();
  // Two copies now visible
  await expect(page.getByText('Export me')).toHaveCount(2);
});

test('import with invalid JSON shows error', async ({ page }) => {
  // Create a temp file with invalid JSON and import it
  await expect(page.getByText(/Failed to import/)).toBeVisible();
});
```

---

## Out of Scope

- CSV import (export-only for CSV)
- Merge import (deduplicate existing todos)
- Incremental/differential export
- Cloud backup integrations (Dropbox, Drive)
- Encrypted export

---

## Success Metrics

- Export completes in < 2s for up to 1000 todos
- Import completes in < 5s for up to 1000 todos (using transaction)
- Zero data loss on export → import round trip
