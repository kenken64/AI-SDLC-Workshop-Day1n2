# PRP 01: Todo CRUD Operations

## Feature Overview
Implement full todo create, read, update, and delete behavior as the foundation of the app. All operations must be scoped to the authenticated user and use Singapore timezone utilities for date handling.

## User Stories
- As a user, I can create a todo with title, optional description, and optional due date.
- As a user, I can view all my todos with current completion state.
- As a user, I can edit todo fields without losing related metadata.
- As a user, I can delete a todo and its dependent records safely.

## User Flow
1. User signs in and lands on the main todo screen.
2. User enters todo details and submits create action.
3. UI applies optimistic update and syncs with API response.
4. User edits or marks completion status, then saves.
5. User deletes a todo and confirms removal.

## Technical Requirements

### Data Model
- Source of truth: `lib/db.ts`
- Todo fields:
  - `id`, `user_id`, `title`, `description`, `due_date`
  - `completed`, `priority`, `recurrence_pattern`, `reminder_minutes`
  - `created_at`, `updated_at`, `last_notification_sent`

### API Endpoints
- `GET /api/todos`: list todos for `session.userId`
- `POST /api/todos`: create todo with validated payload
- `PUT /api/todos/[id]`: update todo fields, including completion
- `DELETE /api/todos/[id]`: delete todo and cascade dependent rows

### Validation Rules
- `title` is required and trimmed
- Reject empty title after trim
- `due_date` must be valid ISO date string if provided
- Ensure todo belongs to current user before update/delete

### Timezone Requirements
- Use `getSingaporeNow()` from `lib/timezone.ts`
- Do not use `new Date()` directly in business logic

## UI Components
- New todo form with title, description, due date controls
- Todo list with inline edit and completion toggle
- Delete confirmation for destructive actions
- Empty state when no todos exist

## Edge Cases
- Duplicate rapid submissions should not create duplicates
- Deleting a missing todo returns 404-safe response
- Very long text is handled by validation and UX truncation
- API failures roll back optimistic UI updates

## Acceptance Criteria
- User can create, list, update, and delete todos end-to-end
- API always enforces authentication and user ownership
- Date handling is consistent with Singapore timezone
- No client direct database access

## Testing Requirements

### Unit
- Validation helper tests for title and due date input
- Mapping tests for API payload to DB model

### Integration
- API tests for all CRUD endpoints with auth and ownership checks
- Error path tests for invalid payloads and missing resources

### E2E (Playwright)
- Create todo, refresh page, verify persistence
- Edit todo title and due date
- Delete todo and verify it is removed

## Out of Scope
- Recurring instance generation
- Notification delivery
- Calendar rendering

## Success Metrics
- CRUD operations succeed for valid inputs with no regressions
- Zero cross-user data access in tests
- Low latency list and mutation responses for normal list sizes
