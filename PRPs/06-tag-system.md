# PRP 06: Tag System

## Feature Overview
Implement color-coded tags for todo organization with many-to-many todo-tag relationships.

## User Stories
- As a user, I can create and manage tags.
- As a user, I can assign multiple tags to a todo.
- As a user, I can filter todos by tag.

## User Flow
1. User creates a tag with name and color.
2. User attaches tags when creating or editing todos.
3. Todo list displays tags as chips.
4. User filters list by selected tag.

## Technical Requirements

### Data Model
- `tags`: `id`, `user_id`, `name`, `color`, `created_at`
- `todo_tags`: join table `todo_id`, `tag_id`
- Enforce uniqueness per user for tag name

### API Endpoints
- `GET/POST /api/tags`
- `PUT/DELETE /api/tags/[id]`
- Todo create/update endpoints accept tag IDs

### Validation
- Tag name required and trimmed
- Color value validated (hex or predefined palette)
- Only user-owned tags can be attached to user-owned todos

## UI Components
- Tag management panel (create, rename, delete)
- Tag chips in todo cards
- Tag picker in todo form

## Edge Cases
- Deleting a tag should remove only associations, not todos
- Duplicate name attempts show actionable error
- Invalid tag IDs in todo payload are rejected

## Acceptance Criteria
- Tag CRUD and assignment work for authenticated users
- Filtering by tag returns expected subset
- Many-to-many relations are preserved after updates

## Testing Requirements

### Unit
- Tag name and color validators
- Tag filter utility tests

### Integration
- Tag CRUD API tests with ownership enforcement
- Todo-tag association tests for create/update

### E2E
- Create tags, attach to todo, filter by tag
- Delete tag and verify todo still exists

## Out of Scope
- Global shared tags across users
- Nested or hierarchical tags

## Success Metrics
- Tag filtering improves retrieval speed for large lists
- Association integrity remains stable after mutations
