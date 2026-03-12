# PRP 01: Todo CRUD Operations

## Feature Overview

Implement a complete Todo CRUD workflow with Singapore timezone semantics, validation, and optimistic client updates.

## User Stories

- As a user, I can create a todo with title, optional description, optional due date.
- As a user, I can view all my todos.
- As a user, I can update any todo.
- As a user, I can delete any todo.
- As a user, I get immediate UI feedback while requests are in-flight.

## Technical Requirements

- API routes:
  - `GET /api/todos`
  - `POST /api/todos`
  - `PUT /api/todos/:id`
  - `DELETE /api/todos/:id`
- Data fields:
  - `id`, `title`, `description`, `due_date`, `completed`, `created_at`, `updated_at`
- Timezone:
  - Use `lib/timezone.ts` helpers for server-side timestamps.
- Validation:
  - `title` required and <= 120 chars
  - `description` <= 500 chars
  - `due_date` must be valid ISO datetime when provided
- Error handling:
  - `400` for invalid input
  - `404` for missing todo
  - `500` for internal errors

## UI Requirements

- Form for creating and editing todos.
- Todo list rendering with completion state.
- Actions for toggle complete, edit, and delete.
- Optimistic updates with rollback on error.

## Acceptance Criteria

- Todos can be created, viewed, edited, and deleted.
- Invalid inputs return friendly error messages.
- UI updates immediately, then confirms or rolls back based on API result.
- Due/updated timestamps are displayed in Singapore locale/timezone.

## Out of Scope

- Authentication
- Subtasks
- Tags
- Recurrence

## Testing Guidance

- Create todo success and validation failure.
- Update title/description/due date and completion status.
- Delete existing and non-existing todo.
- Verify optimistic behavior for create/update/delete.
