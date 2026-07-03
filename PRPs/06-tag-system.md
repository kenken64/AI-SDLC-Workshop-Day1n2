# PRP 06 — Tag System

## Feature Overview

Users can create custom color-coded tags and assign multiple tags to todos. Tags support full CRUD operations. The todo list can be filtered by tag. Tags use a many-to-many relationship (`todo_tags` junction table). Tag names are unique per user. Deleting a tag cascades to remove all tag associations.

---

## User Stories

| Persona | Story | Acceptance Criteria |
|---------|-------|---------------------|
| Organiser | As a user, I want to create tags like "Work" and "Personal" so I can categorise todos | Tag management modal with create/edit/delete |
| Visual thinker | As a user, I want colored tag pills on todos so I can scan categories at a glance | Colored pill with tag name on each tagged todo |
| Filter user | As a user, I want to filter todos by tag so I can focus on one category | Tag filter dropdown shows only matching todos |
| Cleanup manager | As a user, I want to delete a tag and have it removed from all todos automatically | CASCADE delete from todo_tags |
| Multi-tagger | As a user, I want to assign multiple tags to one todo for cross-category tasks | Multiple pills visible on todo item |

---

## User Flow

### Creating a Tag
1. User clicks **+ Manage Tags** button
2. Modal opens with tag list and create form
3. User enters tag name and picks a color (default `#3B82F6`)
4. Clicks **Create Tag** → tag appears in list immediately

### Assigning Tags to a Todo
1. On creation or in edit modal, tag pills appear below the form
2. User clicks a tag pill to select it (fills with tag color, shows ✓)
3. Clicks again to deselect
4. Multiple tags can be selected

### Filtering by Tag
1. User selects a tag from the **All Tags** dropdown above the todo list
2. Only todos with that tag are shown
3. Tag filter combines with search and priority filters (AND logic)

### Editing a Tag
1. In tag management modal, user clicks **Edit** next to a tag
2. Updates name and/or color
3. Clicks **Update** → all todos using the tag reflect the change

### Deleting a Tag
1. In tag management modal, user clicks **Delete** next to a tag
2. Tag removed from all todos (CASCADE delete from `todo_tags`)

---

## Technical Requirements

### Database Schema (`lib/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
```

### TypeScript Interfaces

```typescript
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
```

### DB Operations

```typescript
export const tagDB = {
  findByUserId(userId: number): Tag[] {
    return db.prepare(
      'SELECT * FROM tags WHERE user_id = ? ORDER BY name'
    ).all(userId) as Tag[];
  },

  create(input: CreateTagInput): Tag {
    const result = db.prepare(
      'INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)'
    ).run(input.userId, input.name.trim(), input.color ?? '#3B82F6');
    return db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid) as Tag;
  },

  update(id: number, input: UpdateTagInput): Tag | undefined {
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
    return db.prepare('DELETE FROM tags WHERE id = ?').run(id).changes > 0;
  },

  // Junction table operations
  setTodoTags(todoId: number, tagIds: number[]): void {
    const deleteStmt = db.prepare('DELETE FROM todo_tags WHERE todo_id = ?');
    const insertStmt = db.prepare('INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)');
    db.transaction(() => {
      deleteStmt.run(todoId);
      for (const tagId of tagIds) insertStmt.run(todoId, tagId);
    })();
  },

  getTagsForTodo(todoId: number): Tag[] {
    return db.prepare(`
      SELECT tags.* FROM tags
      JOIN todo_tags ON todo_tags.tag_id = tags.id
      WHERE todo_tags.todo_id = ?
      ORDER BY tags.name
    `).all(todoId) as Tag[];
  },
};
```

### API Endpoints

#### `GET /api/tags` — list user's tags
#### `POST /api/tags` — create tag `{ name, color? }`
#### `PUT /api/tags/[id]` — update `{ name?, color? }`
#### `DELETE /api/tags/[id]` — delete (cascades to `todo_tags`)

#### Tag Assignment (via todo create/update)
- `POST /api/todos` and `PUT /api/todos/[id]` accept `tagIds: number[]`
- Server calls `tagDB.setTodoTags(todoId, tagIds)` after saving todo

#### `GET /api/todos` — include tags in response
```typescript
// Each todo in the response includes its tags
interface TodoWithTags extends Todo {
  tags: Tag[];
}
```

### Validation

```typescript
// Tag name: required, non-empty, max 50 chars, unique per user
if (!name || !name.trim()) {
  return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
}
// Color: valid 6-digit hex
if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
  return NextResponse.json({ error: 'Invalid color format' }, { status: 400 });
}
// Unique name per user — handle SQLite UNIQUE constraint error
```

---

## UI Components

### Tag Pill (on Todo Item)

```tsx
function TagPill({ tag }: { tag: Tag }) {
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
      style={{ backgroundColor: tag.color }}
    >
      {tag.name}
    </span>
  );
}
```

### Tag Selector (in Form & Edit Modal)

```tsx
function TagSelector({
  allTags,
  selectedIds,
  onToggle,
}: {
  allTags: Tag[];
  selectedIds: number[];
  onToggle: (id: number) => void;
}) {
  if (allTags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {allTags.map(tag => {
        const selected = selectedIds.includes(tag.id);
        return (
          <button
            key={tag.id}
            onClick={() => onToggle(tag.id)}
            className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
              selected ? 'text-white border-transparent' : 'text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'
            }`}
            style={selected ? { backgroundColor: tag.color } : {}}
          >
            {selected && '✓ '}{tag.name}
          </button>
        );
      })}
    </div>
  );
}
```

### Tag Management Modal

```tsx
// State: editingTag (Tag | null), newTagName, newTagColor
// Sections:
// 1. Existing tags list with Edit/Delete per row
// 2. Create new tag form (name input + color picker + Create button)
```

### Tag Filter Dropdown

```tsx
<select value={filterTag ?? ''} onChange={e => setFilterTag(e.target.value ? Number(e.target.value) : null)}>
  <option value="">All Tags</option>
  {tags.map(tag => (
    <option key={tag.id} value={tag.id}>{tag.name}</option>
  ))}
</select>
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Duplicate tag name (same user) | Return `400 { error: 'Tag name already exists' }` |
| Invalid hex color | Return `400 { error: 'Invalid color format' }` |
| Deleting tag with associated todos | CASCADE removes from `todo_tags`; todos remain |
| Tag assigned to another user's todo | Server validates todo ownership before calling `setTodoTags` |
| Filter by deleted tag | Filter dropdown refreshes on tag delete; stale filter cleared |
| Tag name with special characters | Allowed; stored as-is |
| Empty tag list | Tag selector hidden; filter dropdown hidden |

---

## Acceptance Criteria

- [ ] User can create a tag with name and color
- [ ] Default tag color is `#3B82F6` (blue)
- [ ] Tag names are unique per user (duplicate rejected with 400)
- [ ] Tags appear as colored pills on tagged todos
- [ ] Multiple tags can be assigned to one todo
- [ ] Tag selector shows ✓ checkmark on selected tags
- [ ] Tags can be toggled on/off in create and edit forms
- [ ] Tag management modal shows all user tags with Edit/Delete actions
- [ ] Editing a tag name/color updates all todos using that tag
- [ ] Deleting a tag removes it from all todos
- [ ] Tag filter shows only todos with the selected tag
- [ ] Tag filter combines with search and priority filters (AND logic)
- [ ] Invalid color hex returns 400

---

## Testing Requirements

### E2E Tests (`tests/07-tags.spec.ts`)

```typescript
test('create tag and assign to todo', async ({ page }) => {
  await helpers.createTag(page, { name: 'Work', color: '#3B82F6' });
  await helpers.createTodo(page, { title: 'Work task', tags: ['Work'] });
  await expect(page.getByText('Work')).toBeVisible();
});

test('filter by tag shows only matching todos', async ({ page }) => {
  await helpers.createTag(page, { name: 'Personal', color: '#10B981' });
  await helpers.createTodo(page, { title: 'Work todo' });
  await helpers.createTodo(page, { title: 'Personal todo', tags: ['Personal'] });

  await page.selectOption('[data-testid="tag-filter"]', { label: 'Personal' });
  await expect(page.getByText('Personal todo')).toBeVisible();
  await expect(page.getByText('Work todo')).not.toBeVisible();
});

test('deleting tag removes pill from todos', async ({ page }) => {
  await helpers.createTag(page, { name: 'Temp', color: '#EF4444' });
  await helpers.createTodo(page, { title: 'Tagged task', tags: ['Temp'] });
  // Delete tag from modal
  await page.getByRole('button', { name: 'Manage Tags' }).click();
  await page.getByText('Temp').locator('..').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Temp')).not.toBeVisible();
});
```

---

## Out of Scope

- Tag hierarchy / nested tags
- Tag sharing between users
- Tag-based analytics or reports
- Tag color themes / presets beyond default
- Tag import/export (tags exported as part of todo export)

---

## Success Metrics

- Tag filter response is instant (client-side filtering)
- Zero orphaned `todo_tags` rows after tag deletion
- User can manage up to 50 tags without performance issues
