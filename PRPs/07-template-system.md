# PRP 07 — Template System

## Feature Overview

Users can save frequently used todo patterns as reusable templates. A template captures title, priority, recurrence settings, reminder timing, category, and description. Templates can optionally include a list of subtasks (JSON-serialized). Using a template instantly creates a new todo with all saved settings. Templates are user-specific and managed in a dedicated modal.

---

## User Stories

| Persona | Story | Acceptance Criteria |
|---------|-------|---------------------|
| Routine worker | As a user, I want to save "Weekly Review" as a template so I can create it with one click | Template appears in Use Template dropdown |
| Power user | As a user, I want templates to include default subtasks so the checklist is pre-populated | Subtasks created automatically from template |
| Organiser | As a user, I want to categorise templates (Work, Personal) so I can find them easily | Category badge shown on template in modal |
| Maintainer | As a user, I want to delete templates I no longer use | Delete button in template modal |
| Quick creator | As a user, I want to create a todo from a template with one click | "Use" button creates todo immediately |

---

## User Flow

### Saving a Template
1. User fills out the todo form (title, priority, recurrence, reminder)
2. A **💾 Save as Template** button appears (once title is non-empty)
3. User clicks it → modal opens
4. User enters: Name (required), Description (optional), Category (optional)
5. Clicks **Save Template** → template saved to database

### Using a Template (Quick)
1. User selects template from **Use Template** dropdown in the todo form
2. Todo is created instantly with all template settings applied
3. Tags and due date must be set manually after creation

### Using a Template (from Modal)
1. User clicks **📋 Templates** button (top navigation)
2. Template modal opens with full list
3. User clicks **Use** on any template
4. Todo created immediately; modal closes

### Deleting a Template
1. In template modal, user clicks **Delete** on any template
2. Template removed from library
3. Existing todos created from this template are unaffected

---

## Technical Requirements

### Database Schema (`lib/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  title_template TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern TEXT,
  reminder_minutes INTEGER,
  subtasks_json TEXT,   -- JSON: [{ title: string, position: number }]
  created_at TEXT DEFAULT (datetime('now'))
);
```

### TypeScript Interfaces

```typescript
export interface Template {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  category: string | null;
  title_template: string;
  priority: Priority;
  is_recurring: number;         // 0 | 1
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  subtasks_json: string | null; // JSON string
  created_at: string;
}

export interface TemplateSubtask {
  title: string;
  position: number;
}

export interface CreateTemplateInput {
  userId: number;
  name: string;
  description?: string;
  category?: string;
  titleTemplate: string;
  priority: Priority;
  isRecurring: boolean;
  recurrencePattern?: RecurrencePattern | null;
  reminderMinutes?: number | null;
  subtasks?: TemplateSubtask[];
}
```

### DB Operations

```typescript
export const templateDB = {
  findByUserId(userId: number): Template[] {
    return db.prepare(
      'SELECT * FROM templates WHERE user_id = ? ORDER BY category, name'
    ).all(userId) as Template[];
  },

  create(input: CreateTemplateInput): Template {
    const result = db.prepare(`
      INSERT INTO templates
        (user_id, name, description, category, title_template, priority, is_recurring, recurrence_pattern, reminder_minutes, subtasks_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.userId,
      input.name,
      input.description ?? null,
      input.category ?? null,
      input.titleTemplate,
      input.priority,
      input.isRecurring ? 1 : 0,
      input.recurrencePattern ?? null,
      input.reminderMinutes ?? null,
      input.subtasks ? JSON.stringify(input.subtasks) : null
    );
    return db.prepare('SELECT * FROM templates WHERE id = ?').get(result.lastInsertRowid) as Template;
  },

  delete(id: number): boolean {
    return db.prepare('DELETE FROM templates WHERE id = ?').run(id).changes > 0;
  },
};
```

### API Endpoints

#### `GET /api/templates` — list user's templates
#### `POST /api/templates` — create template
#### `DELETE /api/templates/[id]` — delete template

#### `POST /api/templates/[id]/use` — create a todo from template

```typescript
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const template = templateDB.findById(parseInt(id, 10));

  if (!template || template.user_id !== session.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Create the todo
  const todo = todoDB.create({
    userId: session.userId,
    title: template.title_template,
    priority: template.priority,
    due_date: null,   // User sets due date after creation
    is_recurring: template.is_recurring === 1,
    recurrence_pattern: template.recurrence_pattern,
    reminder_minutes: template.reminder_minutes,
  });

  // Create subtasks from template
  if (template.subtasks_json) {
    const subtasks: TemplateSubtask[] = JSON.parse(template.subtasks_json);
    for (const sub of subtasks) {
      subtaskDB.create({ todoId: todo.id, title: sub.title });
    }
  }

  return NextResponse.json(todo, { status: 201 });
}
```

---

## UI Components

### Save as Template Button

```tsx
{newTitle.trim() && (
  <button
    onClick={() => setSaveTemplateOpen(true)}
    className="text-sm text-purple-600 dark:text-purple-400 hover:underline"
  >
    💾 Save as Template
  </button>
)}
```

### Save Template Modal

```tsx
// Fields: name (required), description (optional), category (optional)
// Shows current form settings (priority, recurrence, reminder) as preview
// "Save Template" and "Cancel" buttons
```

### Use Template Dropdown

```tsx
<select
  value=""
  onChange={async (e) => {
    if (!e.target.value) return;
    await handleUseTemplate(Number(e.target.value));
    e.target.value = '';
  }}
>
  <option value="">Use Template…</option>
  {templates.map(t => (
    <option key={t.id} value={t.id}>
      {t.name}{t.category ? ` (${t.category})` : ''}
    </option>
  ))}
</select>
```

### Template Manager Modal

Each template row shows:
- **Name** (bold)
- **Description** (if set, muted)
- **Category** badge (if set)
- **Priority** badge (color-coded)
- 🔄 badge (if recurring)
- 🔔 badge (if reminder set)
- **Use** and **Delete** buttons

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Template name empty | Return `400 { error: 'Template name is required' }` |
| Template with no subtasks | `subtasks_json` stored as NULL; no subtasks created on use |
| Using template creates todo without due date | Todo created with `due_date: null`; user sets it manually |
| Deleting template with todos | Todos unaffected (no FK from todos to templates) |
| Subtasks JSON malformed | Server-side parse error caught; return `500` |
| Template belongs to another user | `404` on use or delete |

---

## Acceptance Criteria

- [ ] 💾 Save as Template button appears when title field is non-empty
- [ ] Template modal requires name; description and category are optional
- [ ] Saved template appears in Use Template dropdown
- [ ] Templates with category show `(Category)` suffix in dropdown
- [ ] Using template creates todo with correct title, priority, recurrence, reminder
- [ ] Using template with subtasks creates all subtask rows
- [ ] Template modal shows all user templates with details
- [ ] Deleting template removes it from dropdown and modal
- [ ] Deleting template does NOT affect existing todos
- [ ] `POST /api/templates/[id]/use` creates todo and returns it

---

## Testing Requirements

### E2E Tests (`tests/08-templates.spec.ts`)

```typescript
test('save template and use it', async ({ page }) => {
  // Fill form
  await page.fill('[placeholder="What needs to be done?"]', 'Weekly Review');
  await page.getByRole('button', { name: 'Save as Template' }).click();
  await page.fill('[placeholder="Template name"]', 'My Weekly Review');
  await page.getByRole('button', { name: 'Save Template' }).click();

  // Use template
  await page.selectOption('[data-testid="template-select"]', { label: 'My Weekly Review' });
  await expect(page.getByText('Weekly Review')).toBeVisible();
});

test('template with subtasks creates subtasks on use', async ({ page }) => {
  // Create template that includes subtasks
  // Use template
  // Verify subtask count shown
});
```

---

## Out of Scope

- Template editing (only create/delete)
- Sharing templates between users
- Template versioning
- Automatic due date calculation based on offset (future feature)
- Template categories auto-suggest

---

## Success Metrics

- Template creation and use each complete in < 500ms
- Subtasks from template created in single transaction
- Zero orphaned templates after user deletion
