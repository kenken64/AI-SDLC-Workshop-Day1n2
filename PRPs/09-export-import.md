<<<<<<< HEAD
# PRP 09: Export & Import

## Feature Overview

Enable users to back up and restore todo data via JSON export/import, preserving relationships and validating payloads safely.

## User Stories

- As a user, I can export my todos to a JSON file.
- As a user, I can import a valid backup JSON to restore data.
- As a user, imported data keeps related records linked correctly.

## Technical Requirements

- Export:
  - Provide endpoint to serialize todos and related entities.
  - Include schema version metadata.
  - Return downloadable JSON payload.
- Import:
  - Accept JSON payload and validate structure before write.
  - Remap IDs to avoid collisions.
  - Preserve relationships (todo-to-subtask, todo-to-tags, etc.).
  - Handle partial invalid records by failing safely or reporting per strategy.
- Validation:
  - Ensure required fields exist and types are correct.
  - Reject malformed or unsupported schema version.
  - Cap payload size to avoid abuse.

## Suggested API Contract

- `GET /api/todos/export`
  - Response includes:
    - `version`
    - `exported_at`
    - `todos` (+ related objects when features exist)
- `POST /api/todos/import`
  - Request body: exported JSON format.
  - Response includes import summary (`created`, `skipped`, `errors`).

## Data Integrity Rules

- Never overwrite existing rows by raw IDs from import.
- Build old-to-new ID maps during import.
- Insert parent entities before dependent entities.
- Wrap import in transaction for consistency.

## UI Requirements

- Export button to download JSON.
- Import control to select JSON file and submit.
- Clear success/error summary after import.

## Acceptance Criteria

- Export output can be re-imported into a clean database.
- ID remapping prevents primary key collisions.
- Relationships remain correct after import.
- Invalid payloads are rejected with clear error messages.

## Edge Cases

- Empty export/import payload.
- Duplicate entities inside import payload.
- Importing into non-empty dataset.

## Out of Scope

- CSV import/export
- Cloud sync
- Incremental merge conflict resolution UI

## Testing Guidance

- Round-trip test: export -> clear DB -> import -> verify counts and relationships.
- Import malformed JSON and wrong schema version.
- Import with duplicate IDs and ensure remapping works.
=======
# 09 - Export & Import

## Feature Overview

Backup and restore functionality enabling users to export all todos as JSON or CSV files for backup/analysis, and import previously exported JSON files to restore or transfer data. Supports both human-readable formats with data validation and ID remapping.

## User Stories

### As a cautious user
**I want to** export my todos regularly as a backup
**So that** I don't lose my data if something goes wrong

### As a data analyst
**I want to** export todos as CSV to analyze in spreadsheets
**So that** I can track completion rates and identify patterns

### As a multi-device user
**I want to** export todos from one device and import on another
**So that** I can sync my tasks across devices

### As a team member
**I want to** share my todo structure with colleagues
**So that** they can use it as a template for their own todos

## User Flow

### Export JSON Flow
1. User clicks "Export JSON" button (top right)
2. Browser downloads file: `todos-YYYY-MM-DD.json`
3. File contains array of todo objects with all properties
4. User can store file in cloud storage or local backup

### Export CSV Flow
1. User clicks "Export CSV" button (top right)
2. Browser downloads file: `todos-YYYY-MM-DD.csv`
3. File opens in Excel, Google Sheets, Numbers
4. User can analyze data in spreadsheet

### Import JSON Flow
1. User clicks "Import" button (top right)
2. File picker dialog appears (accepts .json files)
3. User selects previously exported JSON file
4. File is validated for correct structure
5. Todos are imported creating new entries
6. Success message shows count of imported todos
7. Todo list refreshes showing new imports
8. Original IDs from export are reassigned

## Technical Requirements

### API Endpoints

#### Export Endpoint
```
GET /api/todos/export?format=json|csv
```

**Parameters:**
- `format` (query): "json" or "csv" (default: "json")

**Response - JSON Format:**
```typescript
[
  {
    id: 1,
    title: "Sample Todo",
    description: "Details",
    priority: "high",
    recurrence_pattern: "weekly",
    due_date: "2025-11-10T14:00:00Z",
    completed: 0,
    created_at: "2025-11-02T10:30:00Z",
    updated_at: "2025-11-02T10:30:00Z"
  }
]
```

**Response - CSV Format:**
```
ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder,Created At
1,"Sample Todo",false,"2025-11-10T14:00:00Z","high",true,"weekly",60,"2025-11-02T10:30:00Z"
```

**Headers:**
- `Content-Type`: "application/json" or "text/csv"
- `Content-Disposition`: `attachment; filename="todos-YYYY-MM-DD.json|csv"`

#### Import Endpoint
```
POST /api/todos/import
Content-Type: application/json

[
  {
    title: "Sample Todo",
    description: "Details",
    priority: "high",
    recurrence_pattern: "weekly",
    due_date: "2025-11-10T14:00:00Z",
    completed: 0
  }
]
```

**Response Success:**
```json
{
  "success": true,
  "imported": 5
}
```

**Response Error:**
```json
{
  "error": "Failed to import todos. Please check the file format."
}
```

### Component Structure

#### Export Buttons
```typescript
<div className="export-buttons">
  <button onClick={() => handleExport("json")}>
    Export JSON
  </button>
  <button onClick={() => handleExport("csv")}>
    Export CSV
  </button>
</div>
```

#### Import Button
```typescript
<button onClick={handleImport}>
  Import
</button>
```

### Export Implementation

```typescript
async function handleExport(format: "json" | "csv") {
  try {
    const response = await fetch(`/api/todos/export?format=${format}`);
    if (!response.ok) {
      throw new Error("Failed to export todos.");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `todos-${new Date().toISOString().split("T")[0]}.${
      format === "json" ? "json" : "csv"
    }`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    setMessage(`Exported as ${format.toUpperCase()}`);
  } catch (error) {
    setError(`Failed to export as ${format.toUpperCase()}`);
  }
}
```

### Import Implementation

```typescript
async function handleImport() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text) as unknown;

      const response = await fetch("/api/todos/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const payload = (await response.json()) as {
        imported?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to import todos.");
      }

      setMessage(`Successfully imported ${payload.imported || 0} todos`);
      void fetchTodos();
    } catch {
      setError("Failed to import todos. Please check the file format.");
    }
  };
  input.click();
}
```

### Server-Side Export Implementation

```typescript
// app/api/todos/export/route.ts
export async function GET(request: NextRequest) {
  try {
    const format = request.nextUrl.searchParams.get("format") || "json";

    if (!["json", "csv"].includes(format)) {
      return NextResponse.json(
        { error: "Format must be 'json' or 'csv'" },
        { status: 400 }
      );
    }

    const todos = todoDB.list();

    if (format === "json") {
      const json = JSON.stringify(todos, null, 2);
      return new NextResponse(json, {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition":
            `attachment; filename="todos-${new Date().toISOString().split("T")[0]}.json"`,
        },
      });
    }

    // CSV format
    const headers = ["ID", "Title", "Completed", "Due Date", "Priority"];
    const rows = todos.map((todo) => [
      todo.id,
      `"${(todo.title || "").replace(/"/g, '""')}"`,
      todo.completed ? "true" : "false",
      todo.due_date || "",
      todo.priority || "",
    ]);

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition":
          `attachment; filename="todos-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to export todos." },
      { status: 500 }
    );
  }
}
```

### Server-Side Import Implementation

```typescript
// app/api/todos/import/route.ts
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as unknown;

    if (!Array.isArray(body)) {
      return NextResponse.json(
        { error: "Import data must be an array of todos" },
        { status: 400 }
      );
    }

    let importedCount = 0;
    const nowIso = toSingaporeIso(getSingaporeNow());

    for (const item of body) {
      const todo = item as ImportTodo;

      if (!todo.title || typeof todo.title !== "string") continue;

      const title = todo.title.trim();
      if (!title) continue;

      try {
        todoDB.create(
          {
            title,
            description: todo.description?.trim() || null,
            priority:
              ["high", "medium", "low"].includes(todo.priority as string)
                ? (todo.priority as Priority)
                : "medium",
            recurrence_pattern:
              ["daily", "weekly", "monthly", "yearly"].includes(
                todo.recurrence_pattern as string
              )
                ? (todo.recurrence_pattern as RecurrencePattern)
                : null,
            due_date: todo.due_date || null,
          },
          nowIso
        );

        importedCount++;
      } catch {
        continue;
      }
    }

    return NextResponse.json(
      { success: true, imported: importedCount },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to import todos." },
      { status: 500 }
    );
  }
}
```

## UI Components

### Export Buttons
- Green buttons, top-right corner
- "Export JSON" - Complete data backup
- "Export CSV" - Spreadsheet analysis
- Filename format: `todos-YYYY-MM-DD.{json|csv}`

### Import Button
- Blue button, top-right corner
- Opens native file picker
- Accepts only .json files
- Displays success/error message

### File Dialog
- Browser native file picker
- Accepts: .json files only
- Single file selection

## Edge Cases

### Empty Todo List
- Export creates valid JSON/CSV with headers only
- Import of empty file should succeed with 0 imports

### Invalid JSON Format
- Show error: "Failed to import todos. Please check the file format."
- Don't corrupt existing todos
- Allow user to re-try with correct file

### Corrupted Data
- Skip individual todos that fail to validate
- Continue importing remaining todos
- Show success count even if some failed

### Large File Size
- Todos: <100 items = <50KB
- Handle up to 1000 items (~500KB)
- No file size limit enforced
- Timeout: 30 seconds for import

### ID Conflicts
- Import always creates NEW todos with new IDs
- Never updates/overwrites existing todos
- Original IDs from export are ignored

### Missing Fields
- Set defaults for missing optional fields:
  - `description`: null
  - `priority`: "medium"
  - `recurrence_pattern`: null
  - `due_date`: null
  - `completed`: 0

### Duplicate Imports
- Importing same file twice creates duplicates
- Prevent via warning in UI (optional)
- Or allow with clear messaging

## Acceptance Criteria

### JSON Export
- [ ] "Export JSON" button downloads file
- [ ] Filename format: `todos-YYYY-MM-DD.json`
- [ ] File contains all todo fields (id, title, etc.)
- [ ] File is valid JSON format
- [ ] File is human-readable with indentation
- [ ] Empty list exports valid empty array

### CSV Export
- [ ] "Export CSV" button downloads file
- [ ] Filename format: `todos-YYYY-MM-DD.csv`
- [ ] File contains all columns
- [ ] Headers are present
- [ ] File opens in Excel/Google Sheets/Numbers
- [ ] Titles with commas/quotes are escaped
- [ ] Empty list has headers only

### JSON Import
- [ ] "Import" button opens file picker
- [ ] File picker accepts only .json files
- [ ] Valid JSON file imports successfully
- [ ] New todos appear in list
- [ ] Success message shows import count
- [ ] Original IDs are remapped to new IDs
- [ ] All todo properties are preserved
- [ ] Import creates NEW todos (no overwrites)

### Error Handling
- [ ] Invalid JSON format shows error message
- [ ] Corrupted files don't crash the app
- [ ] Missing required fields are handled
- [ ] Invalid enum values use defaults
- [ ] Large files timeout gracefully
- [ ] Network errors show appropriate message

### UI/UX
- [ ] Export buttons are visible and accessible
- [ ] Import button is visible and accessible
- [ ] File downloads work without prompts
- [ ] Success/error messages are clear
- [ ] File picker filters to .json only

## Testing Requirements

### Unit Tests
```typescript
// Export JSON
test('exports todos as valid JSON', async () => {
  const response = await GET(new Request('http://test/api/todos/export?format=json'));
  const data = await response.json();
  expect(Array.isArray(data)).toBe(true);
  expect(data[0]).toHaveProperty('id');
  expect(data[0]).toHaveProperty('title');
});

// Export CSV
test('exports todos as valid CSV', async () => {
  const response = await GET(new Request('http://test/api/todos/export?format=csv'));
  const text = await response.text();
  expect(text).toContain('ID,Title');
});

// Import validation
test('validates required fields on import', async () => {
  const response = await POST(
    new Request('http://test/api/todos/import', {
      body: JSON.stringify([{ title: '' }])
    })
  );
  const data = await response.json();
  expect(data.imported).toBe(0);
});

// Import with defaults
test('uses defaults for missing fields', async () => {
  const response = await POST(
    new Request('http://test/api/todos/import', {
      body: JSON.stringify([{ title: 'Test' }])
    })
  );
  const data = await response.json();
  expect(data.imported).toBe(1);
});
```

### E2E Tests
```typescript
test('user can export and import todos', async () => {
  // Create a todo
  await page.fill('input[placeholder="Title"]', 'Test Todo');
  await page.click('button:has-text("Add Todo")');
  
  // Export JSON
  const downloadPromise = page.waitForEvent('download');
  await page.click('button:has-text("Export JSON")');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/todos-\d{4}-\d{2}-\d{2}\.json/);
  
  // Import JSON
  const filePath = await download.path();
  const uploadPromise = page.waitForEvent('filechooser');
  await page.click('button:has-text("Import")');
  const fileChooser = await uploadPromise;
  await fileChooser.setFiles(filePath);
  
  // Verify import
  await expect(page.locator('text=Successfully imported')).toBeVisible();
});
```

## Out of Scope

- Backup scheduling/automation
- Cloud storage integration (Google Drive, Dropbox)
- Incremental/differential backups
- Version history/rollback
- Encryption
- Data transformation/mapping
- Format conversion (JSON to CSV direct-to-file)
- Merge/combine multiple imports

## Success Metrics

- Export succeeds for 100+ todos
- Import succeeds for 100+ todos
- CSV opens correctly in major spreadsheet apps
- File downloads work reliably
- Error messages are helpful
- Users export at least weekly (recommended)

## Documentation

Update USER_GUIDE.md sections:
- Section 11: Export & Import (comprehensive coverage)
- Include backup strategy recommendations
- CSV and JSON format comparison
- Use cases for each export type
>>>>>>> dcca7cad4188c0d5e0ba8ab6368f77b6da46b485
