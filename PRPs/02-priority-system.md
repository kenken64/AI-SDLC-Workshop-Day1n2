# PRP 02: Priority System

## Feature Overview
Add a three-level priority system for todos: `high`, `medium`, and `low`. Priority must be visible in UI, filterable, and sortable in a predictable way.

## User Stories
- As a user, I can set a priority when creating or editing a todo.
- As a user, I can quickly see high-priority work in the list.
- As a user, I can filter by priority to focus on specific work.

## User Flow
1. User creates or edits a todo and selects a priority.
2. Todo displays a color-coded priority badge.
3. User applies priority filter.
4. List sorts by priority and then due date.

## Technical Requirements

### Data and Types
- Priority enum: `high | medium | low`
- Keep shared type in `lib/db.ts`
- Default value: `medium` for new todos unless explicitly set

### API Behavior
- `POST /api/todos` accepts optional `priority`
- `PUT /api/todos/[id]` updates priority safely
- Reject unknown priority values

### Sorting Rules
- Sort order: `high`, `medium`, `low`
- Secondary sort: due date ascending when available
- Final tie-breaker: creation timestamp descending

## UI Components
- Priority selector in create/edit form
- Badge style variants per priority level
- Filter chips or dropdown for priority selection

## Edge Cases
- Missing priority in legacy rows should map to `medium`
- Priority filter with no matches shows empty filtered state
- Sorting remains stable when due dates are null

## Acceptance Criteria
- Users can set and update priority without data loss
- Priority badges render consistently across pages
- Filtering and sorting behave per defined rules

## Testing Requirements

### Unit
- Priority parser/validator rejects invalid values
- Sorting utility tests for mixed priorities and due dates

### Integration
- API tests for create/update with all priority values
- API rejects invalid priority with `400`

### E2E
- Create todos with different priorities and verify order
- Apply priority filter and verify matching subset

## Out of Scope
- Custom user-defined priority labels
- SLA escalation logic

## Success Metrics
- Users can identify urgent items at a glance
- No sorting regressions in mixed datasets
