# PRP 04: Reminders and Notifications

## Feature Overview
Deliver browser reminders for upcoming todos using configurable offsets and backend duplicate-prevention logic.

## User Stories
- As a user, I can choose reminder timing before a due date.
- As a user, I receive browser notifications for due reminders.
- As a user, I do not receive repeated duplicate reminders for the same todo window.

## User Flow
1. User sets reminder offset on todo.
2. Client polling requests pending reminders.
3. Backend returns due notifications for authenticated user.
4. Browser displays notification and app marks reminder as sent.

## Technical Requirements

### Reminder Offsets
- Allowed values: `15m`, `30m`, `1h`, `2h`, `1d`, `2d`, `1w`
- Persist as normalized minutes in DB (`reminder_minutes`)

### API and Hook Integration
- Endpoint: `GET /api/notifications/check`
- Hook: `lib/hooks/useNotifications.ts`
- Respect `last_notification_sent` to avoid duplicates

### Timezone and Scheduling
- Compare due dates in Singapore timezone
- Ensure polling windows are timezone-safe

## UI Components
- Reminder selector in todo form
- Notification permission prompt and status UI
- Optional reminder badge on todo items

## Edge Cases
- Browser permission denied should degrade gracefully
- Missing due date means no reminder scheduling
- Offline polling gaps should recover without duplicate spam

## Acceptance Criteria
- Users receive reminders at configured offsets
- Duplicate reminder sends are prevented per todo instance
- Notification checks are authenticated and user-scoped

## Testing Requirements

### Unit
- Offset parser and formatter tests
- Reminder eligibility calculator tests

### Integration
- Notification check endpoint returns only eligible reminders
- Update to `last_notification_sent` is correct

### E2E
- Configure reminder, advance time/mocks, verify browser notice
- Verify repeated polling does not trigger duplicate notice

## Out of Scope
- Push notifications to mobile devices
- Email or SMS reminders

## Success Metrics
- Reminder delivery is reliable in supported browsers
- Duplicate reminder rate remains near zero
