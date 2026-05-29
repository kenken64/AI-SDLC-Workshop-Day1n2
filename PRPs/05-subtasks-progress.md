# PRP 05: Subtasks and Progress Tracking

## Feature Overview
Allow each todo to contain an ordered checklist of subtasks and show completion progress visually.

## User Stories
- As a user, I can add multiple subtasks to a todo.
- As a user, I can reorder and complete subtasks.
- As a user, I can see progress percentage for each todo.

## User Flow
1. User opens a todo detail/edit view.
2. User adds, reorders, and toggles subtask completion.
3. UI updates progress bar based on completed subtasks.
4. Deleting parent todo removes subtasks automatically.

## Technical Requirements

### Data Model
- Subtask fields: `id`, `todo_id`, `title`, `completed`, `position`, `created_at`
- `todo_id` foreign key with cascade delete

### API Endpoints
- Create/list/update/delete subtasks under user-owned todo
- Position updates should persist ordering deterministically

### Progress Calculation
- Progress formula: $completed / total * 100$
- Empty subtask list should display 0 percent or hidden progress state

## UI Components
- Subtask list with checkbox per row
- Drag or move controls for ordering
- Progress bar and count summary (for example `3/5 complete`)

## Edge Cases
- Blank subtask titles rejected
- Reorder conflicts resolve to unique contiguous positions
- Completed parent todo and subtask states stay logically consistent

## Acceptance Criteria
- Users can manage subtasks end-to-end
- Progress updates immediately after subtask changes
- Cascade delete works reliably

## Testing Requirements

### Unit
- Progress calculator utility tests
- Position normalization tests

### Integration
- Subtask CRUD API tests with ownership checks
- Parent delete test confirms subtask cascade behavior

### E2E
- Add multiple subtasks, toggle completion, verify progress
- Reorder subtasks and verify persisted order after refresh

## Out of Scope
- Nested subtasks
- Dependency graphs between subtasks

## Success Metrics
- Subtask interactions feel instant and predictable
- Progress accuracy remains 100 percent consistent in tests
