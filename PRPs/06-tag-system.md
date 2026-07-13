# Tag System

Custom color-coded labels that let users categorize todos with multiple, user-owned tags and filter by them across the app.

**Dependencies**: Adds `tags` and `todo_tags` tables that relate many-to-many with `todos` ([PRP 01](./01-todo-crud-operations.md)). Feeds tag-based filtering in [PRP 08 — Search & Filtering](./08-search-filtering.md). Tags are inherited by new instances of recurring todos ([PRP 03](./03-recurring-todos.md)). Export/import handling of tag data is covered by [PRP 09 — Export & Import](./09-export-import.md).

[← PRP Index](./README.md)

---

## Feature Overview

The Tag System lets each user define their own set of named, color-coded tags and attach any number of them to any todo. Tags are a many-to-many relationship: a todo can have multiple tags, and a tag can be applied to multiple todos. Tags are managed centrally through a "Manage Tags" modal (create/edit/delete) and applied per-todo via a multi-select pill UI in the create/edit forms. Tags are rendered as colored pills on todo list items and can be used as a filter criterion (see PRP 08).

Tags are strictly user-scoped: no user can see, edit, or apply another user's tags, and tag names only need to be unique within a single user's tag set.

## User Stories

- As a user, I want to create a tag with a name and a color, so that I can visually categorize related todos.
- As a user, I want to attach multiple tags to a single todo, so that a task can belong to more than one category (e.g. "Work" and "Urgent").
- As a user, I want to edit a tag's name or color and have every todo using it update automatically, so that I don't have to re-tag anything.
- As a user, I want to delete a tag and have it disappear from every todo that had it, so that stale categories don't linger.
- As a user, I want to filter my todo list down to a single tag, so that I can focus on one category of work at a time.
- As a user, I want tag names I choose to never collide with another user's tags, so that my organization scheme is private to me.

## User Flow

### Creating a tag
1. User clicks **"+ Manage Tags"** near the todo form.
2. Modal opens showing existing tags plus a create form: name text field, color picker (native HTML color input) with a parallel hex text input, both bound to the same value.
3. User enters a name, picks a color (defaults to `#3B82F6`), clicks **"Create Tag"**.
4. Tag is created and appears immediately in the modal's tag list and in the tag-pill selector below the todo form.

### Applying tags to a todo
1. Below the todo creation form (or inside the edit modal), the user sees a row of tag pills for all their tags.
2. Clicking an unselected pill selects it (checkmark + colored background + white text); clicking a selected pill deselects it.
3. Multiple tags may be selected. On submit, the selected tag IDs are attached to the todo.

### Editing a tag
1. In the Manage Tags modal, user clicks **"Edit"** next to a tag.
2. Name and/or color fields become editable inline (or in a sub-form).
3. User clicks **"Update"**. The tag row updates, and every todo displaying that tag re-renders with the new name/color on next fetch (tag data is looked up live, not copied onto the todo).

### Deleting a tag
1. In the Manage Tags modal, user clicks **"Delete"** next to a tag.
2. User confirms the destructive action.
3. Tag row is removed from `tags`; all `todo_tags` rows referencing it are removed via `ON DELETE CASCADE`. Todos that had other tags keep those tags; todos that only had this tag now show no tag pills.

### Filtering by tag
1. User opens the **"All Tags"** dropdown in the filter bar (see PRP 08 for how this composes with search/priority/date filters).
2. Selecting a tag name filters the visible list to todos carrying that tag.
3. Clicking a tag pill directly on a todo card also applies that tag as the active filter.
4. Selecting **"All Tags"** clears the tag filter.

## Technical Requirements

### Database Schema

This PRP owns the `tags` and `todo_tags` tables:

```sql
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, name)
);

CREATE TABLE todo_tags (
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (todo_id, tag_id)
);

CREATE INDEX idx_tags_user_id ON tags(user_id);
CREATE INDEX idx_todo_tags_tag_id ON todo_tags(tag_id);
```

The `UNIQUE(user_id, name)` constraint enforces per-user name uniqueness at the database level — the same tag name is allowed for two different users. `todo_tags` has no surrogate key; the composite primary key `(todo_id, tag_id)` makes attach operations naturally idempotent-safe (a duplicate insert violates the PK and should be caught and treated as a no-op).

### Types (`lib/db.ts`)

```typescript
export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string; // hex string, e.g. "#3B82F6"
  created_at: string;
}

export interface CreateTagInput {
  name: string;
  color?: string; // defaults to '#3B82F6'
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
}
```

`tagDB` exports on `lib/db.ts`: `findAllByUser(userId)`, `findById(id, userId)`, `create(userId, input)`, `update(id, userId, input)`, `delete(id, userId)`, `attachToTodo(todoId, tagId, userId)`, `detachFromTodo(todoId, tagId, userId)`, `findByTodoId(todoId)`.

### API Endpoints

All routes require a valid session; all queries are scoped by `session.userId`.

```typescript
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const tags = tagDB.findAllByUser(session.userId);
  return NextResponse.json(tags);
}
```

| Method | Route | Body | Notes |
|---|---|---|---|
| GET | `/api/tags` | — | All tags for `session.userId` |
| POST | `/api/tags` | `{ name, color? }` | Trims `name`, validates hex `color`, rejects duplicate name for this user with `409` |
| PUT | `/api/tags/[id]` | `{ name?, color? }` | Only the owning user may update; `404` if tag not found or not owned |
| DELETE | `/api/tags/[id]` | — | CASCADEs `todo_tags` rows automatically |
| POST | `/api/todos/[id]/tags` | `{ tag_id }` | Attaches tag to todo; idempotent (no-op if already attached) |
| DELETE | `/api/todos/[id]/tags` | `{ tag_id }` | Detaches tag from todo; idempotent (no-op if not attached) |

`[id]` params are async in Next.js 16: `const { id } = await params;`

```typescript
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { name, color } = await request.json();
  const trimmed = name?.trim();
  if (!trimmed) {
    return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
  }
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return NextResponse.json({ error: 'Color must be a valid hex code' }, { status: 400 });
  }

  try {
    const tag = tagDB.create(session.userId, { name: trimmed, color: color ?? '#3B82F6' });
    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    // UNIQUE(user_id, name) violation
    return NextResponse.json({ error: 'A tag with this name already exists' }, { status: 409 });
  }
}
```

## UI Components

```tsx
interface TagPillProps {
  tag: Tag;
  selected?: boolean;
  onClick?: (tag: Tag) => void;
}

function TagPill({ tag, selected = false, onClick }: TagPillProps) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(tag)}
      style={selected ? { backgroundColor: tag.color } : undefined}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium border transition-colors
        ${selected
          ? 'text-white border-transparent'
          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600'}`}
    >
      {selected && <span aria-hidden>✓</span>}
      <span className="truncate max-w-[10rem]">{tag.name}</span>
    </button>
  );
}
```

```tsx
function ManageTagsModal({ tags, onClose, onCreate, onUpdate, onDelete }: {
  tags: Tag[];
  onClose: () => void;
  onCreate: (input: CreateTagInput) => Promise<void>;
  onUpdate: (id: number, input: UpdateTagInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Manage Tags</h2>

        <ul className="space-y-2 mb-4 max-h-64 overflow-y-auto">
          {tags.map((tag) => (
            <li key={tag.id} className="flex items-center justify-between gap-2">
              <TagPill tag={tag} selected />
              <div className="flex gap-2 text-sm">
                <button onClick={() => setEditingId(tag.id)} className="text-blue-600 dark:text-blue-400">Edit</button>
                <button onClick={() => onDelete(tag.id)} className="text-red-600 dark:text-red-400">Delete</button>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tag name"
            className="flex-1 border rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          <button
            onClick={() => onCreate({ name, color })}
            className="bg-blue-600 text-white rounded px-3 py-1"
          >
            Create Tag
          </button>
        </div>

        <button onClick={onClose} className="mt-4 text-gray-500 dark:text-gray-400">Close</button>
      </div>
    </div>
  );
}
```

## Edge Cases

- **Duplicate name, same user**: reject with `409` and a clear message ("A tag with this name already exists"); the `UNIQUE(user_id, name)` constraint is the backstop even if client-side validation is skipped.
- **Same name, different users**: allowed — uniqueness is scoped to `user_id`.
- **Deleting a heavily-used tag** (applied to 50+ todos): must remain fast (single CASCADE delete, not N individual detach calls) and must not partially fail — either all `todo_tags` rows are removed or the whole operation fails.
- **Invalid color value**: reject non-hex strings (`red`, `blue`, malformed hex) with `400`; do not silently fall back to default without telling the client.
- **Whitespace-only or empty name**: trim server-side; reject if the trimmed result is empty.
- **Very long tag name**: no hard server-side cap is required by spec, but the `TagPill` UI must truncate with ellipsis (`truncate`) so layout doesn't break.
- **Removing the last tag from a todo**: valid state — a todo may have zero tags; the tag row area simply renders nothing.
- **Attaching an already-attached tag / detaching a non-attached tag**: both must be treated as successful no-ops, not errors, since the UI may fire redundant requests during rapid toggling.
- **Deleting a tag that is currently applied as the active filter**: the filter should gracefully reset to "All Tags" rather than showing an empty list referencing a tag ID that no longer exists.
- **Cross-user access**: requesting `PUT`/`DELETE` on a tag ID owned by another user must return `404` (not `403`, to avoid confirming the ID exists), scoped via `WHERE id = ? AND user_id = ?`.

## Acceptance Criteria

- [ ] User can create a tag with a name and color; color defaults to `#3B82F6` if omitted
- [ ] User can edit a tag's name and/or color; the change is reflected on every todo using that tag without re-tagging
- [ ] User can delete a tag; it is removed from all todos via CASCADE
- [ ] Duplicate tag name for the same user is rejected with a clear error
- [ ] The same tag name is allowed for two different users
- [ ] A todo can have multiple tags attached simultaneously
- [ ] Tag pills render with the tag's color and white text, in both light and dark mode
- [ ] Filtering by a tag shows only todos carrying that tag (see PRP 08 for combination with other filters)
- [ ] Attaching/detaching an already-attached/detached tag is idempotent (no error, no duplicate rows)
- [ ] All tag endpoints reject unauthenticated requests with `401`
- [ ] All tag endpoints scope reads/writes to `session.userId`; cross-user access returns `404`

## Testing Requirements

### E2E (Playwright) — `tests/08-tags.spec.ts`

- [ ] Create a tag via the Manage Tags modal; verify it appears in the tag list and pill selector
- [ ] Edit a tag's name/color; verify the change propagates to a todo already displaying that tag
- [ ] Delete a tag; verify it disappears from all todos that had it
- [ ] Attempt to create a duplicate tag name for the same user; verify the error message is shown and no duplicate row is created
- [ ] Assign two tags to one todo; verify both pills render on the todo card
- [ ] Filter the todo list by a tag; verify only matching todos are shown, then clear the filter via "All Tags"
- [ ] Use the `createTag()` helper from `tests/helpers.ts` to set up fixtures for other feature tests that depend on tags (e.g. filtering, templates)

### Unit Tests

- [ ] Tag name validation (empty/whitespace rejected, valid names accepted, trimming applied)
- [ ] Hex color validation (`#3B82F6` accepted, `red` and `#ZZZ` rejected)
- [ ] `UNIQUE(user_id, name)` constraint: same name across two users succeeds; same name twice for one user throws
- [ ] `attachToTodo` / `detachFromTodo` idempotency (second call does not throw or duplicate)
- [ ] CASCADE delete: deleting a tag removes all matching `todo_tags` rows and leaves unrelated rows intact

## Out of Scope

- Tag hierarchies or nesting (e.g. "Work → Project → Client" is only a suggested *manual naming convention* in the user guide, not a real parent/child relationship)
- Tag-based automation or rules (e.g. "auto-apply tag X when condition Y")
- Shared or team tags visible across multiple users
- Tag usage analytics or reporting (e.g. "top 5 tags by todo count")
- Tag icons or non-color visual differentiation
- Bulk tag rename/merge tooling

## Success Metrics

- Tag CRUD API calls complete in **< 300ms** on average
- Zero orphaned `todo_tags` rows after any tag deletion (verified via integrity check: no `todo_tags.tag_id` without a matching `tags.id`)
- Zero `UNIQUE(user_id, name)` constraint violations reach the client as unhandled 500s (all surfaced as `409` with a clear message)
- 100% of tag pills render with WCAG AA-compliant contrast against their background color in both light and dark mode
