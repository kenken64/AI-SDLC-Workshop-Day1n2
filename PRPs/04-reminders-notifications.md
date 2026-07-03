# PRP 04 — Reminders & Notifications

## Feature Overview

Users can set a reminder on any todo that has a due date. The system sends a browser notification at the configured time before the due date. The backend polls for pending reminders every minute and tracks which ones have been sent to prevent duplicates. Notifications require explicit browser permission.

---

## User Stories

| Persona | Story | Acceptance Criteria |
|---------|-------|---------------------|
| Busy professional | As a user, I want to be notified 1 hour before a deadline so I'm not caught off guard | Browser notification fires 1h before due_date |
| Routine keeper | As a user, I want a 1-day reminder for recurring todos so I have time to prepare | Reminder fires 24h before due_date |
| Notification manager | As a user, I want to choose reminder timing per todo so I can customise alerts | 7 preset timings available in dropdown |
| One-time notification | As a user, I want each reminder to only fire once even if I reload the page | last_notification_sent prevents duplicates |
| Permission manager | As a user, I want a clear button to enable notifications and see when they're active | "Enable Notifications" / "Notifications On" button |

---

## User Flow

### Enabling Notifications
1. User clicks **🔔 Enable Notifications** button (orange, top-right of main page)
2. Browser prompts for notification permission
3. User grants permission → button changes to **🔔 Notifications On** (green badge)
4. System begins polling `/api/notifications/check` every 60 seconds

### Setting a Reminder
1. User creates or edits a todo that has a **due date set**
2. Reminder dropdown becomes enabled
3. User selects a timing option (e.g., "1 hour before")
4. Todo shows 🔔 badge with abbreviated time (e.g., `🔔 1h`)

### Receiving a Notification
1. Background poll hits `/api/notifications/check`
2. Server finds todos where `reminder_time <= now` and `last_notification_sent IS NULL`
3. Returns list of due reminders
4. Client fires `new Notification(title, { body })` for each
5. Server updates `last_notification_sent` to prevent re-firing

---

## Technical Requirements

### Database Columns

```sql
-- On todos table
reminder_minutes INTEGER,         -- NULL = no reminder. Values: 15, 30, 60, 120, 1440, 2880, 10080
last_notification_sent TEXT,      -- ISO string; NULL = not sent yet
```

### Migration (`lib/db.ts`)

```typescript
// Run in initSchema — safe to repeat
const cols = db.prepare("PRAGMA table_info(todos)").all() as { name: string }[];
if (!cols.find(c => c.name === 'reminder_minutes')) {
  db.exec("ALTER TABLE todos ADD COLUMN reminder_minutes INTEGER");
}
if (!cols.find(c => c.name === 'last_notification_sent')) {
  db.exec("ALTER TABLE todos ADD COLUMN last_notification_sent TEXT");
}
```

### Reminder Options

```typescript
export const REMINDER_OPTIONS = [
  { value: null,  label: 'None' },
  { value: 15,    label: '15 minutes before' },
  { value: 30,    label: '30 minutes before' },
  { value: 60,    label: '1 hour before' },
  { value: 120,   label: '2 hours before' },
  { value: 1440,  label: '1 day before' },
  { value: 2880,  label: '2 days before' },
  { value: 10080, label: '1 week before' },
] as const;

export const REMINDER_LABELS: Record<number, string> = {
  15: '15m', 30: '30m', 60: '1h', 120: '2h', 1440: '1d', 2880: '2d', 10080: '1w',
};
```

### Notifications API (`app/api/notifications/check/route.ts`)

```typescript
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const now = getSingaporeNow();
  const dueReminders = todoDB.findDueReminders(session.userId, now);

  // Mark as sent
  for (const todo of dueReminders) {
    todoDB.markNotificationSent(todo.id, now.toISOString());
  }

  return NextResponse.json(dueReminders.map(t => ({
    id: t.id,
    title: t.title,
    due_date: t.due_date,
  })));
}
```

### DB Operations (`lib/db.ts`)

```typescript
// Find todos where (due_date - reminder_minutes) <= now AND last_notification_sent IS NULL
findDueReminders(userId: number, now: Date): Todo[] {
  return db.prepare(`
    SELECT * FROM todos
    WHERE user_id = ?
      AND completed = 0
      AND due_date IS NOT NULL
      AND reminder_minutes IS NOT NULL
      AND last_notification_sent IS NULL
      AND datetime(due_date, '-' || reminder_minutes || ' minutes') <= ?
  `).all(userId, now.toISOString()) as Todo[];
},

markNotificationSent(id: number, sentAt: string): void {
  db.prepare(
    'UPDATE todos SET last_notification_sent = ? WHERE id = ?'
  ).run(sentAt, id);
},
```

### Notification Hook (`lib/hooks/useNotifications.ts`)

```typescript
export function useNotifications() {
  const [enabled, setEnabled] = useState(
    typeof window !== 'undefined' && Notification.permission === 'granted'
  );

  async function requestPermission() {
    const permission = await Notification.requestPermission();
    setEnabled(permission === 'granted');
    return permission === 'granted';
  }

  function schedulePolling(intervalMs = 60000) {
    return setInterval(async () => {
      if (Notification.permission !== 'granted') return;
      const res = await fetch('/api/notifications/check');
      if (!res.ok) return;
      const reminders: { id: number; title: string; due_date: string }[] = await res.json();
      for (const r of reminders) {
        new Notification(`⏰ ${r.title}`, {
          body: `Due at ${formatSingaporeDate(r.due_date)}`,
          icon: '/favicon.ico',
        });
      }
    }, intervalMs);
  }

  return { enabled, requestPermission, schedulePolling };
}
```

### Reset on Todo Completion / Edit

When a recurring todo creates a new instance, `last_notification_sent` must be `NULL` on the new instance (handled automatically by `todoDB.create`). When a todo's `due_date` or `reminder_minutes` is edited, reset `last_notification_sent`:

```typescript
// In todoDB.update — when due_date or reminder_minutes changes
if ('due_date' in input || 'reminder_minutes' in input) {
  last_notification_sent = null;
}
```

---

## UI Components

### Enable Notifications Button

```tsx
function NotificationButton({ enabled, onEnable }: { enabled: boolean; onEnable: () => void }) {
  return (
    <button
      onClick={onEnable}
      className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
        enabled
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
          : 'bg-orange-500 hover:bg-orange-600 text-white'
      }`}
    >
      {enabled ? '🔔 Notifications On' : '🔔 Enable Notifications'}
    </button>
  );
}
```

### Reminder Dropdown

```tsx
<select
  value={reminderMinutes ?? ''}
  onChange={e => setReminderMinutes(e.target.value ? Number(e.target.value) : null)}
  disabled={!dueDate}  // Must have a due date
>
  {REMINDER_OPTIONS.map(opt => (
    <option key={opt.value ?? 'none'} value={opt.value ?? ''}>
      {opt.label}
    </option>
  ))}
</select>
{!dueDate && <p className="text-xs text-gray-400">Set a due date to enable reminders</p>}
```

### Reminder Badge

```tsx
{todo.reminder_minutes && (
  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
    🔔 {REMINDER_LABELS[todo.reminder_minutes]}
  </span>
)}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Reminder time already passed when todo created | Notification fires on next poll (within 60s) |
| User denies notification permission | Button shows "Enable Notifications" again; polling skipped |
| Todo completed before reminder fires | Completed todos excluded from `findDueReminders` |
| Reminder dropdown enabled without due date | Dropdown disabled; explanatory hint shown |
| Browser tab closed during polling | Notifications only fire when tab is open |
| Reminder minutes not in allowed values | API rejects with `400 { error: 'Invalid reminder value' }` |
| Editing due date resets notification | `last_notification_sent` set to NULL on update |
| Multiple browser tabs open | Each tab polls independently; server deduplication via `last_notification_sent` prevents double-fire |

---

## Acceptance Criteria

- [ ] Reminder dropdown is disabled when no due date is set
- [ ] Reminder dropdown shows 7 options (None + 6 timings) when due date is set
- [ ] Selected reminder shows 🔔 badge with abbreviated time
- [ ] "Enable Notifications" button requests browser permission
- [ ] After permission granted, button shows "Notifications On" (green)
- [ ] `/api/notifications/check` returns only todos where reminder time has passed
- [ ] Notification not re-sent after `last_notification_sent` is set
- [ ] Editing due date or reminder resets `last_notification_sent`
- [ ] Completed todos are excluded from notifications

---

## Testing Requirements

### E2E Tests (`tests/05-reminders.spec.ts`)

```typescript
test('reminder badge visible on todo with reminder set', async ({ page }) => {
  await helpers.createTodo(page, {
    title: 'Important meeting',
    dueDate: /* 2h from now */,
    reminderMinutes: 60,
  });
  await expect(page.getByText('🔔 1h')).toBeVisible();
});

test('reminder dropdown disabled without due date', async ({ page }) => {
  await expect(page.getByTestId('reminder-select')).toBeDisabled();
});

test('notification API returns due reminders', async ({ request }) => {
  // Create todo with past reminder time, not yet sent
  const res = await request.get('/api/notifications/check');
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(Array.isArray(data)).toBeTruthy();
});
```

---

## Out of Scope

- Push notifications (service worker)
- Email or SMS reminders
- Multiple reminders per todo
- Snooze functionality
- Sound/vibration customisation

---

## Success Metrics

- Notification fires within 60 seconds of reminder time
- Zero duplicate notifications per reminder event
- Reminder badge visible on 100% of todos with reminders set
