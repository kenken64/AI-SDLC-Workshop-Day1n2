# PRP 03: Recurring Todos

## Feature Overview

Support recurring todos with patterns `daily`, `weekly`, `monthly`, `yearly`. When a recurring todo is completed, automatically generate its next instance.

## User Stories

- As a user, I can choose a recurrence pattern while creating/editing a todo.
- As a user, when I complete a recurring todo, the next todo appears automatically.
- As a user, the next instance keeps my original metadata.

## Technical Requirements

- Database:
  - Add nullable `recurrence_pattern TEXT` to `todos`.
  - Allowed values: `daily | weekly | monthly | yearly | null`.
- API:
  - Create/update accepts `recurrence_pattern`.
  - Validate values and reject invalid patterns with `400`.
- Completion behavior:
  - If a todo has a recurrence pattern and is marked complete:
    - Mark current todo as completed.
    - Create next todo automatically.
- Due date calculation logic:
  - Base date: existing `due_date`; fallback to current Singapore timestamp.
  - Add interval by pattern:
    - `daily`: +1 day
    - `weekly`: +7 days
    - `monthly`: +1 month
    - `yearly`: +1 year
- Metadata inheritance for next instance:
  - Inherit `title`, `description`, `priority`, `recurrence_pattern`.
  - Set `completed = 0`.
  - Set new `created_at`/`updated_at` to current SG timestamp.

## UI Requirements

- Recurrence select in create/edit form with `No recurrence` option.
- Display recurrence in each todo card.
- Keep optimistic update flow; append/prepend server-returned next instance when applicable.

## Acceptance Criteria

- User can set and update recurrence pattern.
- Completing recurring todo creates next instance automatically.
- Next instance due date follows pattern rules and preserves metadata.
- Non-recurring completion does not create extra todo.

## Edge Cases

- Recurring todo without due date should still generate next instance from current timestamp.
- Completing an already-completed recurring todo should not duplicate next instances.

## Out of Scope

- Custom recurrence rules (e.g., every 2 weeks)
- Skip rules and exception calendars

## Testing Guidance

- Complete one todo for each recurrence pattern and verify generated due date.
- Verify inherited metadata on next instance.
- Verify no duplicate next instance when re-completing already completed item.
