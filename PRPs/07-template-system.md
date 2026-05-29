# PRP 07: Template System

## Feature Overview
Enable reusable todo templates so users can quickly create common task patterns, including optional subtasks.

## User Stories
- As a user, I can save a todo setup as a template.
- As a user, I can apply a template to create a new todo quickly.
- As a user, template-created todos preserve expected subtasks and defaults.

## User Flow
1. User selects "Save as template" from an existing todo or creates template directly.
2. User provides template metadata and optional due date offset.
3. User chooses a template and applies it.
4. System creates a new todo and subtasks from stored definition.

## Technical Requirements

### Data Model
- `templates`: `id`, `user_id`, `name`, `description`, `subtasks_json`, `category`, `created_at`
- `subtasks_json` stores array of `{ title, position }`

### API Endpoints
- `GET/POST /api/templates`
- `PUT/DELETE /api/templates/[id]`
- `POST /api/templates/[id]/use` to instantiate todo

### Template Application Rules
- Apply priority, reminder, and recurrence defaults when defined
- Convert due date offset to actual date using Singapore timezone
- Validate and sanitize subtasks before insert

## UI Components
- Template gallery/list with search and category grouping
- Create/edit template form with subtasks builder
- "Use template" action in main todo workflow

## Edge Cases
- Corrupted `subtasks_json` should fail safely with clear error
- Missing template on apply returns 404
- Applying template repeatedly should be idempotent per action (no accidental double submit)

## Acceptance Criteria
- Users can create, edit, delete, and apply templates
- Applied templates create complete todos with expected subtasks
- Template operations remain user-scoped and authenticated

## Testing Requirements

### Unit
- Template JSON serialization and parsing tests
- Due date offset computation tests

### Integration
- Template CRUD API tests and ownership checks
- `use` endpoint tests for todo/subtask creation

### E2E
- Save template from todo and apply it to create new todo
- Verify subtasks and defaults are correctly instantiated

## Out of Scope
- Shared template marketplace
- Version history for templates

## Success Metrics
- Reduced time-to-create for repeated task patterns
- High success rate for template application without manual fixes
