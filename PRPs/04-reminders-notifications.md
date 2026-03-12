# PRP 04: Reminders & Notifications

## Feature Overview

Add a reminder system that sends browser notifications before a todo's due date. Users choose a reminder offset (e.g., 15 minutes, 1 hour, 1 day before), the backend calculates the trigger time, and the frontend polls for due reminders and fires browser notifications.

## User Stories

- As a user, I can set a reminder offset when creating or editing a todo so I am notified before the due date.
- As a user, I receive a browser notification at the correct time before a todo is due.
- As a user, I am not spammed with duplicate notifications for the same reminder.
- As a user, I can remove a reminder by clearing the offset.

## User Flow

1. User creates/edits a todo and selects a reminder offset from a dropdown (None, 15m, 30m, 1h, 2h, 1d, 2d, 1w).
2. The API stores `reminder_minutes` on the todo.
3. The frontend polls `GET /api/notifications/check` on a regular interval (e.g., every 60 seconds).
4. The backend computes `due_date − reminder_minutes` and returns todos whose reminder time has passed and `last_notification_sent` is null.
5. The frontend requests browser notification permission and fires a notification for each returned todo.
6. The frontend calls `POST /api/notifications/dismiss` with the todo id to set `last_notification_sent`, preventing duplicates.

## Technical Requirements

### Database

Add two nullable columns to `todos`:

```sql
ALTER TABLE todos ADD COLUMN reminder_minutes INTEGER;
ALTER TABLE todos ADD COLUMN last_notification_sent TEXT;
```

`reminder_minutes` stores the offset in minutes before `due_date`. Allowed values: `15 | 30 | 60 | 120 | 1440 | 2880 | 10080 | null`.

`last_notification_sent` stores an ISO timestamp, set after the notification fires to prevent duplicates.

### API Endpoints

#### Existing endpoints (extend)

- `POST /api/todos` — accept optional `reminder_minutes`.
- `PUT /api/todos/:id` — accept optional `reminder_minutes`; when `reminder_minutes` changes, reset `last_notification_sent` to `null` so the new reminder can fire.

#### New endpoints

- `GET /api/notifications/check`
  - Query all incomplete todos where:
    - `reminder_minutes IS NOT NULL`
    - `due_date IS NOT NULL`
    - `last_notification_sent IS NULL`
    - `datetime(due_date, '-' || reminder_minutes || ' minutes') <= datetime('now')`
  - Return `{ data: Todo[] }`.
- `POST /api/notifications/dismiss`
  - Body: `{ todo_id: number }`
  - Set `last_notification_sent` to current Singapore ISO timestamp.
  - Return `{ success: true }`.

### Timezone

All reminder calculations must use Singapore timezone via `lib/timezone.ts`:

```typescript
import { getSingaporeNow, toSingaporeIso } from '@/lib/timezone';
```

### Validation

- `reminder_minutes` must be one of the allowed integer values or `null`.
- A reminder without a `due_date` is stored but never triggers (no error).
- Invalid `reminder_minutes` values return `400`.

### Types

```typescript
export const REMINDER_OPTIONS = [15, 30, 60, 120, 1440, 2880, 10080] as const;
export type ReminderMinutes = (typeof REMINDER_OPTIONS)[number];
```

## UI Requirements

- Reminder dropdown in create/edit form with human-readable labels:
  - `None`, `15 minutes before`, `30 minutes before`, `1 hour before`, `2 hours before`, `1 day before`, `2 days before`, `1 week before`.
- Display active reminder indicator on todo cards that have a reminder set.
- Use `useEffect` with `setInterval` to poll `/api/notifications/check` every 60 seconds.
- Request `Notification.requestPermission()` on first interaction.
- Show browser `new Notification(title, { body })` for each due reminder.
- Call dismiss endpoint after notification is shown.

## Edge Cases

- Todo has `reminder_minutes` but no `due_date` — store silently, never trigger.
- User updates `reminder_minutes` on a todo that already fired — reset `last_notification_sent` to allow the new reminder to fire.
- User completes a todo before the reminder fires — reminder should not trigger for completed todos (query filters `completed = 0`).
- Browser denies notification permission — log warning, still dismiss to prevent re-polling.
- Recurring todo completion creates next instance — next instance should inherit `reminder_minutes` but have `last_notification_sent = null`.

## Acceptance Criteria

- User can set, update, and remove reminder offsets.
- Notifications fire at the correct time relative to due date.
- No duplicate notifications for the same reminder.
- Updating reminder offset resets notification state.
- Completed todos do not trigger reminders.
- Recurring todo next instance inherits reminder offset with fresh notification state.
- Invalid `reminder_minutes` returns `400`.

## Out of Scope

- Push notifications (service workers, web push API)
- Email or SMS notifications
- Custom reminder times (arbitrary minutes)
- Multiple reminders per todo
- Sound or vibration settings

## Testing Guidance

- Create a todo with `due_date` in the near future and `reminder_minutes = 15`; verify `/api/notifications/check` returns it when the trigger time passes.
- Dismiss a notification and verify it does not appear again on subsequent polls.
- Update `reminder_minutes` on a dismissed todo and verify it re-triggers.
- Complete a todo with a pending reminder and verify it is excluded from check results.
- Create a todo with `reminder_minutes` but no `due_date` and verify it never appears in check results.
- Complete a recurring todo with a reminder and verify the next instance has `reminder_minutes` set and `last_notification_sent = null`.
