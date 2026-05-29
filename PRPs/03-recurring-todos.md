# PRP 03: Recurring Todos

## Feature Overview
Support recurring todos so users can maintain repeated tasks on daily, weekly, monthly, or yearly schedules.

## User Stories
- As a user, I can mark a todo as recurring with a cadence.
- As a user, completing a recurring todo automatically creates the next instance.
- As a user, the next instance keeps important metadata (priority, tags, reminder offset).

## User Flow
1. User creates a todo and sets recurrence pattern.
2. User completes the current instance.
3. System creates next due instance and keeps recurrence pattern.
4. Completed instance remains in history.

## Technical Requirements

### Recurrence Values
- Supported patterns: `daily`, `weekly`, `monthly`, `yearly`
- Stored in todo row as `recurrence_pattern`

### Completion Logic
- Trigger on `PUT /api/todos/[id]` when completion changes to true
- Create next todo instance with:
  - same title and description
  - same priority
  - same recurrence pattern
  - same reminder offset
  - same tags and subtasks template behavior per app rules

### Date Handling
- Calculate next due date in Singapore timezone
- Month/year boundaries must be correct for local calendar rules

## UI Components
- Recurrence selector in create/edit form
- Recurrence label in todo card/list row
- Optional quick action to stop recurrence

## Edge Cases
- Completing recurring todo without due date requires fallback strategy
- End-of-month dates (for example day 31) must be normalized
- Prevent duplicate next instances on rapid repeated requests

## Acceptance Criteria
- Completing recurring todos creates exactly one next instance
- Metadata inheritance is preserved
- Non-recurring todos do not create new instances

## Testing Requirements

### Unit
- Next-date calculation for each recurrence pattern
- Boundary tests for month/year transitions

### Integration
- API completion test verifies next instance creation
- Ownership and auth checks remain enforced

### E2E
- Create recurring todo, complete it, verify next instance appears
- Validate inherited priority/tags/reminder settings

## Out of Scope
- Complex rules like "every second Tuesday"
- Time-of-day recurrence engine

## Success Metrics
- Recurring workflows reduce manual re-entry
- No duplicate generation under normal user interactions
