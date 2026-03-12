# PRP 02: Priority System

## Feature Overview

Add `high`, `medium`, `low` priority to todos with visual badges, automatic ordering, and client-side filtering.

## User Stories

- As a user, I can assign priority when creating/editing a todo.
- As a user, I can quickly identify priority using badge colors.
- As a user, I can filter list by selected priority.
- As a user, high-priority items appear before medium and low.

## Technical Requirements

- Database:
  - Add `priority TEXT NOT NULL DEFAULT 'medium'` on `todos`.
- API:
  - Accept `priority` on create/update.
  - Validate allowed values: `high | medium | low`.
- Sorting:
  - Order by priority rank (`high`, `medium`, `low`) then newest first.
- Frontend:
  - Priority select in form.
  - Priority badge in todo card.
  - Priority filter dropdown for list.

## Acceptance Criteria

- New todos default to `medium` when not specified.
- Invalid priority values return `400`.
- List sorting always prioritizes `high` before `medium` before `low`.
- Priority filter shows only matching todos.

## Out of Scope

- Multi-priority assignments
- User-custom priority scales

## Testing Guidance

- Create todos with each priority and verify ordering.
- Update priority and confirm badge + persistence.
- Filter by each priority and `all`.
