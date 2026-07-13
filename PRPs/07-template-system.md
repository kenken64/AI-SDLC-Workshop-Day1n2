# Template System

Save frequently used todo patterns (title, priority, recurrence, reminder, and subtask checklist) as reusable templates for instant creation of common tasks.

**Dependencies**: Builds on the `todos` model from [PRP 01 - Todo CRUD Operations](./01-todo-crud-operations.md); reuses `priority` from [PRP 02 - Priority System](./02-priority-system.md), recurrence fields from [PRP 03 - Recurring Todos](./03-recurring-todos.md), and `reminder_minutes` from [PRP 04 - Reminders & Notifications](./04-reminders-notifications.md). Reproduces the subtask shape (`title`, `position`) from [PRP 05 - Subtasks & Progress Tracking](./05-subtasks-progress.md) via JSON serialization rather than a live foreign-key relationship.

[← PRP Index](./README.md)

## Feature Overview

The Template System lets a user capture the recurring "shape" of a todo — its title, priority, recurrence pattern, reminder timing, and checklist of subtasks — as a named, reusable pattern. Creating a new todo from a template is a single click/API call: the app instantiates a fresh todo (and its subtasks) from the template without the user re-entering any of that information. Templates are a **snapshot pattern, not a live link** — editing or deleting a template never affects todos previously created from it.

Templates deliberately exclude two things that are inherently instance-specific: a concrete **due date** (only a relative offset is stored) and **tags** (chosen fresh each time a todo is created, since tag relevance can vary per instance).

> **Note on source conflict**: `USER_GUIDE.md` §9 describes templates as excluding subtasks ("added after creation"). This PRP instead follows `.github/copilot-instructions.md` and `EVALUATION.md` (Feature 07), which are explicit and detailed that subtasks **are** captured via `subtasks_json` and recreated on use — see Technical Requirements below. Treat this PRP's schema as authoritative; the user guide's description is a simplification.

## User Stories

- **As a frequent task creator**, I want to save a todo's settings as a template so I can recreate similar todos (e.g., "Weekly Team Meeting") without re-entering priority, recurrence, and reminder every time.
- **As a project manager**, I want to save a checklist-style todo (e.g., "Client Onboarding" with 6 subtasks) as a template so every new client gets the exact same checklist structure.
- **As a returning user**, I want a quick "Use Template" dropdown right in the todo form so I don't have to leave my current context to instantiate a common task.
- **As an organizer**, I want to categorize templates (Work, Personal, Finance, Health, Education, or custom) so my template library stays navigable as it grows.
- **As a template owner**, I want to delete templates I no longer need without worrying that it will delete or corrupt todos I already created from them.

## User Flow

### Creating a template
1. User fills out the todo form (title, priority, optionally: repeat + pattern, reminder) and optionally adds subtasks to the in-progress todo.
2. Once the title field is non-empty, a **"💾 Save as Template"** button appears.
3. Clicking it opens the **Save Template modal**:
   - **Name** (required, text input)
   - **Description** (optional, textarea)
   - **Category** (optional, text input with common suggestions: Work, Personal, Finance, Health, Education)
4. User clicks **"Save Template"** → `POST /api/templates` is called with the current form state (title, priority, recurrence, reminder, subtasks) plus name/description/category.
5. Modal closes; template is now available in both the quick dropdown and the Template Manager.

### Using a template (quick path)
1. In the todo form, the user opens the **"Use Template"** dropdown.
2. Each entry renders as `"{name}"` or `"{name} ({category})"` if a category is set.
3. Selecting a template immediately calls `POST /api/templates/[id]/use`.
4. A new todo is created instantly (no due date unless the template has a `due_date_offset_minutes`, no tags) and appears in the todo list.

### Using / managing a template (full manager)
1. User clicks **"📋 Templates"** in the top navigation.
2. The **Template Manager modal** lists all templates the user owns, each showing: name (bold), description (if set), category badge (if set), priority badge, 🔄 recurrence badge + pattern (if recurring), 🔔 reminder badge (if set).
3. Clicking **"Use"** on a template card creates a todo immediately (same as the quick path) and closes the modal.
4. Clicking **"Delete"** removes the template from the library after confirmation. Existing todos created from that template are untouched.

## Technical Requirements

### Database schema

This PRP owns the `templates` table:

```sql
CREATE TABLE templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  title_template TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',      -- 'high' | 'medium' | 'low', see PRP 02
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern TEXT,                      -- 'daily' | 'weekly' | 'monthly' | 'yearly', see PRP 03
  reminder_minutes INTEGER,                     -- see PRP 04 for allowed values
  due_date_offset_minutes INTEGER,              -- minutes from "use" time to compute new todo's due_date; NULL = no due date
  subtasks_json TEXT,                           -- JSON.stringify([{ title: string, position: number }]); NULL = no subtasks
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_templates_user_id ON templates(user_id);
```

Templates do **not** store `tags` or a concrete `due_date` — only the relative `due_date_offset_minutes`, resolved at use-time.

### Types (`lib/db.ts`)

```typescript
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

export interface TemplateSubtask {
  title: string;
  position: number;
}

export interface CreateTemplateDto {
  name: string;
  description?: string;
  category?: string;
  title_template: string;
  priority: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern;
  reminder_minutes?: number;
  due_date_offset_minutes?: number;
  subtasks?: TemplateSubtask[]; // serialized to subtasks_json before insert
}
```

### API endpoints

| Method | Route | Description |
|---|---|---|
| GET | `/api/templates` | List all templates for the authenticated user |
| POST | `/api/templates` | Create a new template |
| PUT | `/api/templates/[id]` | Update a template's fields |
| DELETE | `/api/templates/[id]` | Delete a template (does not touch todos created from it) |
| POST | `/api/templates/[id]/use` | Create a new todo (+ subtasks) from the template |

All routes check auth first and scope every query to `session.userId`, per project convention:

```typescript
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const templates = templateDB.findAllByUser(session.userId);
  return NextResponse.json(templates);
}
```

`POST /api/templates` — serializes the in-progress todo's subtasks into `subtasks_json`:

```typescript
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body: CreateTemplateDto = await request.json();
  if (!body.name?.trim() || !body.title_template?.trim()) {
    return NextResponse.json({ error: 'Name and title are required' }, { status: 400 });
  }

  const subtasks_json = body.subtasks?.length
    ? JSON.stringify(body.subtasks.map((s, i) => ({ title: s.title, position: i })))
    : null;

  const template = templateDB.create({
    user_id: session.userId,
    name: body.name.trim(),
    description: body.description ?? null,
    category: body.category ?? null,
    title_template: body.title_template.trim(),
    priority: body.priority ?? 'medium',
    is_recurring: body.is_recurring ?? false,
    recurrence_pattern: body.recurrence_pattern ?? null,
    reminder_minutes: body.reminder_minutes ?? null,
    due_date_offset_minutes: body.due_date_offset_minutes ?? null,
    subtasks_json,
  });

  return NextResponse.json(template, { status: 201 });
}
```

`POST /api/templates/[id]/use` — deserializes `subtasks_json`, resolves the due date from the offset using Singapore time, and creates the todo + subtasks. This depends on PRP 01's todo-creation logic and PRP 05's subtask-creation logic:

```typescript
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const template = templateDB.findById(Number(id));
  if (!template || template.user_id !== session.userId) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const due_date = template.due_date_offset_minutes != null
    ? addMinutes(getSingaporeNow(), template.due_date_offset_minutes).toISOString()
    : null;

  const todo = todoDB.create({
    user_id: session.userId,
    title: template.title_template,
    priority: template.priority,
    due_date,
    is_recurring: template.is_recurring,
    recurrence_pattern: template.recurrence_pattern,
    reminder_minutes: template.reminder_minutes,
  });

  let subtasks: TemplateSubtask[] = [];
  if (template.subtasks_json) {
    try {
      subtasks = JSON.parse(template.subtasks_json);
    } catch {
      subtasks = []; // malformed JSON must not fail todo creation — see Edge Cases
    }
  }
  subtasks.forEach((s) => subtaskDB.create({ todo_id: todo.id, title: s.title, position: s.position }));

  return NextResponse.json({ ...todo, subtasks: subtaskDB.findAllByTodo(todo.id) }, { status: 201 });
}
```

## UI Components

`SaveTemplateModal` — captures name/description/category and posts the current form state:

```tsx
function SaveTemplateModal({ todoDraft, onClose, onSaved }: {
  todoDraft: { title: string; priority: Priority; is_recurring: boolean; recurrence_pattern: RecurrencePattern | null; reminder_minutes: number | null; subtasks: { title: string }[] };
  onClose: () => void;
  onSaved: (t: Template) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  async function handleSave() {
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: description || undefined,
        category: category || undefined,
        title_template: todoDraft.title,
        priority: todoDraft.priority,
        is_recurring: todoDraft.is_recurring,
        recurrence_pattern: todoDraft.recurrence_pattern ?? undefined,
        reminder_minutes: todoDraft.reminder_minutes ?? undefined,
        subtasks: todoDraft.subtasks.map((s, i) => ({ title: s.title, position: i })),
      }),
    });
    if (res.ok) onSaved(await res.json());
  }

  return (
    <Modal onClose={onClose} title="Save as Template">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" required />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" />
      <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (optional)" />
      <button onClick={handleSave} disabled={!name.trim()}>Save Template</button>
    </Modal>
  );
}
```

`TemplateCard` — shared between the quick dropdown's expanded preview and the Template Manager modal:

```tsx
function TemplateCard({ template, onUse, onDelete }: { template: Template; onUse: (id: number) => void; onDelete?: (id: number) => void }) {
  return (
    <div className="template-card">
      <div className="template-card-title">
        <strong>{template.name}</strong>
        {template.category && <span className="badge badge-category">{template.category}</span>}
      </div>
      {template.description && <p className="template-description">{template.description}</p>}
      <div className="template-badges">
        <PriorityBadge priority={template.priority} />
        {template.is_recurring && <span className="badge badge-recurring">🔄 {template.recurrence_pattern}</span>}
        {template.reminder_minutes != null && <span className="badge badge-reminder">🔔 {formatReminder(template.reminder_minutes)}</span>}
      </div>
      <div className="template-actions">
        <button onClick={() => onUse(template.id)}>Use</button>
        {onDelete && <button onClick={() => onDelete(template.id)} className="danger">Delete</button>}
      </div>
    </div>
  );
}
```

## Edge Cases

- **No due-date offset**: `due_date_offset_minutes` is `NULL` → the created todo has `due_date: null`. This is the common case (most templates don't imply a specific timing).
- **Malformed `subtasks_json`**: if a row is ever corrupted (manual DB edit, migration bug), `JSON.parse` must be wrapped in try/catch; on failure, create the todo with zero subtasks rather than failing the whole "use" request.
- **Deleting a template mid-use**: if a `DELETE /api/templates/[id]` and a `POST /api/templates/[id]/use` race (e.g., two browser tabs), the `use` request should 404 if the template is already gone; already-created todos from prior uses are unaffected since there is no foreign key from `todos` back to `templates`.
- **Duplicate template names**: unlike tags, template names are **not** required to be unique per user — the schema has no `UNIQUE` constraint on `(user_id, name)`. Two templates named "Weekly Review" are valid and both appear in the list.
- **Large `subtasks_json`**: no enforced cap on subtask count per template; very large lists should still round-trip correctly through `JSON.stringify`/`JSON.parse`, but the UI should scroll rather than break layout in the manager preview.
- **Template referencing a since-deleted tag or category convention**: category is a free-text field, not a foreign key, so there is no orphan risk — an arbitrary/retired category string simply displays as-is.
- **Recurrence without a due date**: if a template has `is_recurring: true` but no `due_date_offset_minutes`, the resulting todo violates PRP 03's rule that recurring todos require a due date. The `use` endpoint should surface a validation error (or, per product decision, silently unset `is_recurring` on the created todo) — recommended: reject template creation itself if `is_recurring` is true and `due_date_offset_minutes` is null, enforcing the invariant at save-time instead of use-time.

## Acceptance Criteria

- [ ] Can save the current todo-form state (title, priority, recurrence, reminder, subtasks) as a named template
- [ ] Template name is required; description and category are optional
- [ ] "Use Template" quick dropdown lists all templates, showing `"{name} ({category})"` when category is set
- [ ] Selecting a template from the dropdown creates a new todo in a single action, with no extra confirmation step
- [ ] Template Manager modal lists all templates with priority/recurrence/reminder badges visible
- [ ] Using a template from the manager creates a todo and closes the modal
- [ ] Deleting a template removes it from both the dropdown and manager, and does not alter or delete any todo previously created from it
- [ ] Subtasks defined at template-save time are recreated (title + position, `completed: false`) on every subsequent use
- [ ] Templates never carry a concrete due date — only an optional relative offset is applied at use-time
- [ ] Templates never carry tags — the created todo has no tags, regardless of what the original draft todo had selected
- [ ] Templates are scoped per user; user A never sees or can use user B's templates

## Testing Requirements

Test file: `tests/09-templates.spec.ts`. Use `tests/helpers.ts` methods (`createTodo()`, `addSubtask()`) to build the draft state before saving as a template.

**E2E tests:**
- [ ] Save a todo (with priority, recurrence, reminder, 2 subtasks) as a template; verify it appears in both the quick dropdown and the manager
- [ ] Use a template from the quick dropdown; verify the created todo has matching title/priority/recurrence/reminder and the two subtasks (unchecked)
- [ ] Use a template from the manager modal; verify modal closes and todo appears in the list
- [ ] Delete a template; verify it disappears from dropdown/manager and a previously-created todo from it is untouched
- [ ] Create a template with a due-date offset; use it; verify the created todo's due date is offset correctly from "now" in Singapore time
- [ ] Create a template with no subtasks; use it; verify the created todo has zero subtasks (no crash on null `subtasks_json`)

**Unit tests:**
- [ ] `subtasks_json` round-trip: an array of `{ title, position }` serializes and deserializes losslessly
- [ ] Malformed `subtasks_json` string causes the parser to fall back to an empty subtask array instead of throwing
- [ ] Due-date-offset calculation: given a fixed `getSingaporeNow()` and an offset in minutes, the resulting `due_date` is correct to the minute
- [ ] Template creation rejects `is_recurring: true` with no `due_date_offset_minutes` (or documents the chosen fallback behavior, per Edge Cases)

## Out of Scope

- Sharing templates between users or teams
- Template versioning or edit history
- Retroactively updating todos previously created from a template when the template itself is edited (templates are a one-time pattern copy, never a live link)
- Nested or recursive templates (a template referencing another template)
- Enforcing category values against a fixed enum (category remains free text)

## Success Metrics

- Creating a todo from a template completes in a single API round trip in under 300ms
- 100% fidelity of subtask titles and ordering across a save → use round trip
- Zero todos corrupted or orphaned by template deletion (verified via cascade-free schema — no FK from `todos` to `templates`)
- Template Manager remains usable (no layout break) with 50+ templates and templates containing 20+ subtasks
