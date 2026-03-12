# PRP 06: Tag System

## Feature Overview

Implement color-coded tags that can be assigned to todos via a many-to-many relationship. Users can create, edit, delete tags and filter the todo list by one or more tags.

## User Stories

- As a user, I can create named, color-coded tags.
- As a user, I can assign one or more tags to a todo.
- As a user, I can remove tags from a todo.
- As a user, I can filter the todo list by a selected tag.
- As a user, I can edit or delete existing tags.
- As a user, deleting a tag removes it from all associated todos.

## User Flow

1. User opens a tag management section and creates tags (e.g., "Work" — blue, "Personal" — green).
2. When creating or editing a todo, user selects tags from available options.
3. Todo cards display assigned tag badges with their colors.
4. User clicks a tag badge or selects a tag filter to show only matching todos.
5. User can edit tag name/color or delete a tag from the management section.

## Technical Requirements

### Database

Create `tags` and `todo_tags` tables:

```sql
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6B7280'
);

CREATE TABLE IF NOT EXISTS todo_tags (
  todo_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (todo_id, tag_id),
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

### Types

```typescript
export type Tag = {
  id: number;
  name: string;
  color: string;
};
```

### API Endpoints

#### Tag CRUD

- `GET /api/tags`
  - Return all tags ordered by name.
  - Response: `{ data: Tag[] }`.
- `POST /api/tags`
  - Body: `{ name: string, color?: string }`
  - Validation: `name` required, <= 50 chars, unique. `color` must be valid hex (e.g., `#FF5733`), defaults to `#6B7280`.
  - Response: `{ data: Tag }` with status `201`.
- `PUT /api/tags/:id`
  - Body: `{ name?: string, color?: string }`
  - Same validation rules.
  - Response: `{ data: Tag }`.
- `DELETE /api/tags/:id`
  - CASCADE removes entries from `todo_tags`.
  - Response: `{ success: true }`.

#### Todo–Tag Association

- `POST /api/todos/:id/tags`
  - Body: `{ tag_id: number }`
  - Creates association in `todo_tags`. Idempotent (re-adding existing association is a no-op).
  - Response: `{ success: true }` with status `201`.
- `DELETE /api/todos/:id/tags/:tagId`
  - Removes association from `todo_tags`.
  - Response: `{ success: true }`.
- `GET /api/todos` (extend)
  - Include tags for each todo in the response. Join through `todo_tags` and return tags as an array on each todo object.

### Database Operations (lib/db.ts)

Export a `tagDB` object:

```typescript
export const tagDB = {
  list(): Tag[] { ... },
  getById(id: number): Tag | undefined { ... },
  create(name: string, color: string): Tag { ... },
  update(id: number, input: { name?: string; color?: string }): Tag | undefined { ... },
  delete(id: number): boolean { ... },
  addToTodo(todoId: number, tagId: number): void { ... },
  removeFromTodo(todoId: number, tagId: number): boolean { ... },
  getTagsForTodo(todoId: number): Tag[] { ... },
};
```

### Validation

- Tag `name` required, <= 50 chars, must be unique (case-insensitive).
- Tag `color` must match `/^#[0-9A-Fa-f]{6}$/`.
- Duplicate tag names return `409 Conflict`.
- Adding a non-existent tag to a todo returns `404`.
- Adding a tag to a non-existent todo returns `404`.

### Predefined Color Palette (UI suggestion)

```typescript
const TAG_COLORS = [
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#3B82F6', // blue
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#6B7280', // gray
];
```

## UI Requirements

- Tag management panel (create, edit, delete tags).
- Tag color picker using the predefined palette.
- Multi-select tag assignment in the todo create/edit form.
- Tag badges displayed on todo cards with background color.
- Tag filter dropdown or clickable tag badges to filter the todo list.
- "Clear filter" option to show all todos.

## Edge Cases

- Creating a tag with a duplicate name (case-insensitive) returns `409`.
- Deleting a tag that is assigned to multiple todos removes all associations.
- Assigning the same tag to a todo twice is idempotent (no error, no duplicate row).
- Deleting a todo removes its `todo_tags` entries via CASCADE.
- Tag name with leading/trailing whitespace should be trimmed before storage.

## Acceptance Criteria

- Tags can be created with name and color.
- Tags can be assigned to and removed from todos.
- Todo list displays tag badges with correct colors.
- Filtering by tag shows only matching todos.
- Duplicate tag names are rejected with `409`.
- Deleting a tag removes all its todo associations.
- Deleting a todo removes all its tag associations.
- Tag names are trimmed and validated.

## Out of Scope

- Hierarchical tags / tag groups
- Tag-based auto-categorization
- Tag usage analytics
- Custom color input (free-form beyond palette)

## Testing Guidance

- Create a tag and verify it appears in the tag list.
- Assign a tag to a todo and verify the badge displays.
- Filter by tag and verify only matching todos appear.
- Remove a tag from a todo and verify the badge disappears.
- Delete a tag and verify it is removed from all todos.
- Attempt to create a duplicate tag name — verify `409` response.
- Delete a todo with tags and verify `todo_tags` entries are cascade-deleted.
- Update a tag's color and verify the change reflects on assigned todo cards.
