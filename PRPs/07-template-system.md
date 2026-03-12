# PRP 07: Template System

## Feature Overview

Allow users to save reusable todo templates that capture a title, description, priority, subtask list, and a due-date offset. Using a template creates a new todo with pre-filled values and a calculated due date.

## User Stories

- As a user, I can save a todo pattern as a template for repeated use.
- As a user, I can create a new todo from a template with one click.
- As a user, the template pre-fills title, description, priority, and subtasks.
- As a user, I can set a due-date offset (e.g., 3 days from now) on a template.
- As a user, I can edit and delete templates.

## User Flow

1. User opens the template management section.
2. User clicks "Create Template" and fills in: title, description, priority, subtasks, and optional due-date offset in days.
3. Template is saved and appears in the template list.
4. User clicks "Use Template" on any template.
5. A new todo is created with the template's values; due date is calculated as `now + offset_days`.
6. User can edit or delete templates from the management section.

## Technical Requirements

### Database

Create a `templates` table:

```sql
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
```

`subtasks_json` stores a JSON array of subtask definitions:

```json
[
  { "title": "Step 1", "position": 0 },
  { "title": "Step 2", "position": 1 }
]
```

### Types

```typescript
export type TemplateSubtask = {
  title: string;
  position: number;
};

export type Template = {
  id: number;
  title: string;
  description: string | null;
  priority: Priority;
  subtasks_json: string;         // JSON string in DB
  due_date_offset_days: number | null;
  created_at: string;
  updated_at: string;
};

type TemplateInput = {
  title: string;
  description?: string | null;
  priority?: Priority;
  subtasks?: TemplateSubtask[];
  due_date_offset_days?: number | null;
};
```

### API Endpoints

#### Template CRUD

- `GET /api/templates`
  - Return all templates ordered by `created_at DESC`.
  - Response: `{ data: Template[] }`.
- `POST /api/templates`
  - Body: `{ title, description?, priority?, subtasks?: { title, position }[], due_date_offset_days?: number }`
  - Serialize `subtasks` array to `subtasks_json` string before storing.
  - Validation: `title` required, <= 120 chars; `description` <= 500 chars; `priority` must be valid; `due_date_offset_days` must be non-negative integer when provided; each subtask `title` required, <= 200 chars.
  - Response: `{ data: Template }` with status `201`.
- `PUT /api/templates/:id`
  - Body: same fields as create, all optional.
  - Response: `{ data: Template }`.
- `DELETE /api/templates/:id`
  - Response: `{ success: true }`.

#### Use Template

- `POST /api/templates/:id/use`
  - Creates a new todo from the template:
    - Copies `title`, `description`, `priority`.
    - Calculates `due_date` as `getSingaporeNow() + due_date_offset_days` (null if no offset).
    - Creates the todo, then creates subtasks from the parsed `subtasks_json`.
  - Response: `{ data: Todo }` with status `201` (include the created todo with its id).

### Database Operations (lib/db.ts)

Export a `templateDB` object:

```typescript
export const templateDB = {
  list(): Template[] { ... },
  getById(id: number): Template | undefined { ... },
  create(input: TemplateInput, nowIso: string): Template { ... },
  update(id: number, input: Partial<TemplateInput>, nowIso: string): Template | undefined { ... },
  delete(id: number): boolean { ... },
};
```

### Due Date Offset Calculation

```typescript
import { getSingaporeNow, toSingaporeIso } from '@/lib/timezone';

function calculateDueDateFromOffset(offsetDays: number): string {
  const now = getSingaporeNow();
  now.setDate(now.getDate() + offsetDays);
  return toSingaporeIso(now);
}
```

### Validation

- Template `title` required, <= 120 chars.
- `description` <= 500 chars.
- `priority` must be `high | medium | low`.
- `due_date_offset_days` must be a non-negative integer or `null`.
- `subtasks` array: each item must have `title` (required, <= 200 chars) and `position` (non-negative integer).
- Maximum 20 subtasks per template.

## UI Requirements

- Template management section accessible from the main page.
- Template list showing title, priority badge, subtask count, and offset.
- "Create Template" form with:
  - Title, description, priority select.
  - Inline subtask builder (add/remove subtask rows).
  - Due date offset input (number of days, optional).
- "Use Template" button on each template card that creates the todo and refreshes the list.
- "Edit" and "Delete" actions on each template card.

## Edge Cases

- Using a template with no `due_date_offset_days` creates a todo with `due_date = null`.
- Using a template with an empty `subtasks_json` (`[]`) creates a todo with no subtasks.
- Deleting a template does not affect todos previously created from it.
- Subtask positions in the JSON should be used as-is when creating subtasks.
- Template with `subtasks_json` containing invalid JSON should be rejected on create/update with `400`.

## Acceptance Criteria

- Templates can be created, listed, edited, and deleted.
- Using a template creates a todo with correct title, description, priority, due date, and subtasks.
- Due date is calculated as current Singapore time + offset days.
- Subtasks from the template are created with correct titles and positions.
- Templates without subtasks or offsets work correctly (null/empty values).
- Validation rejects invalid input with `400`.
- Template operations return `404` for non-existent template ids.

## Out of Scope

- Template categories or folders
- Template sharing between users
- Template versioning
- Importing/exporting templates
- Recurring pattern inheritance from templates

## Testing Guidance

- Create a template with title, description, priority, 2 subtasks, and 7-day offset.
- Use the template and verify the created todo has correct values and due date 7 days from now.
- Verify subtasks are created on the new todo with correct titles and positions.
- Create a template with no subtasks and no offset; use it and verify todo has no subtasks and null due date.
- Edit a template's title and subtasks; verify changes persist.
- Delete a template and verify it is removed; existing todos created from it remain unaffected.
- Attempt to create a template with empty title — verify `400` response.
- Attempt to create a template with more than 20 subtasks — verify `400` response.
