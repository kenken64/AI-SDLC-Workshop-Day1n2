# Reminders & Notifications

Browser-based due-date reminders for todos, delivered via the Web Notifications API on a client-side polling loop.

**Dependencies**: Extends the `todos` table and API from [01-todo-crud-operations.md](./01-todo-crud-operations.md) (adds `reminder_minutes` and `last_notification_sent`). Reminder settings are inherited by new instances of recurring todos ([03-recurring-todos.md](./03-recurring-todos.md)) and captured by the Template System ([07-template-system.md](./07-template-system.md)).

[← PRP Index](./README.md)

---

## Feature Overview

Todos with a due date can carry an optional reminder offset (15 minutes to 1 week before due). Once the user grants browser notification permission, the client polls a backend endpoint every 30 seconds; when a todo's reminder window is reached, the browser fires a native notification exactly once per reminder, tracked server-side via `last_notification_sent` so refreshes, multiple tabs, or restarts never cause duplicates.

## User Stories

- As a user, I want to opt in to browser notifications so I'm not surprised by an unexpected permission prompt.
- As a user, I want to pick how far in advance I'm reminded (15m, 30m, 1h, 2h, 1d, 2d, or 1w) so the reminder matches how much lead time the task needs.
- As a user, I want a reminder to fire even if I've switched to another browser tab, so I don't miss it.
- As a user, I want each reminder to notify me only once, so I'm not spammed by repeated alerts for the same todo.
- As a user, I want the reminder control disabled until I've set a due date, so I don't create a reminder that has nothing to anchor to.

## User Flow

1. User clicks the **"🔔 Enable Notifications"** button (orange) in the top-right of the main page.
2. Browser shows its native permission prompt; user grants permission.
3. Button updates to **"🔔 Notifications On"** (green badge) — no further action needed to keep it enabled across sessions (browser remembers the grant per-origin).
4. When creating or editing a todo that has a due date, the user opens the **Reminder** dropdown and selects one of 7 presets, or "None".
5. The todo row now shows a **🔔 badge** with the abbreviated timing (e.g. `🔔 1h`).
6. In the background, the client polls `GET /api/notifications/check` every 30 seconds.
7. When the current time enters the todo's reminder window (`due_date - reminder_minutes <= now <= due_date`) and no notification has been sent yet for this window, the browser fires `new Notification(...)` and the client immediately calls the API to stamp `last_notification_sent`.
8. If the user edits the due date or reminder timing afterward, the reminder "resets" (see Edge Cases) and can fire again for the new window.

## Technical Requirements

### Database Schema

These columns live on the existing `todos` table (defined in full in PRP 01) — only the reminder-related columns are shown here:

```sql
-- Columns on `todos`, owned by this feature:
reminder_minutes INTEGER,        -- one of 15, 30, 60, 120, 1440, 2880, 10080 (15m,30m,1h,2h,1d,2d,1w); NULL = no reminder
last_notification_sent TEXT      -- ISO 8601 timestamp, NULL until a notification has fired for the current due_date/reminder_minutes pair
```

No new tables. No new indexes beyond the existing `idx_todos_due_date` from PRP 01, which this feature's query also benefits from.

### Types

```typescript
// lib/db.ts
export type ReminderMinutes = 15 | 30 | 60 | 120 | 1440 | 2880 | 10080;

export const REMINDER_LABELS: Record<ReminderMinutes, string> = {
  15: '15m',
  30: '30m',
  60: '1h',
  120: '2h',
  1440: '1d',
  2880: '2d',
  10080: '1w',
};

// Todo.reminder_minutes: number | null and Todo.last_notification_sent: string | null
// are already declared on the Todo interface in PRP 01.
```

### API Endpoint

`GET /api/notifications/check`

```typescript
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const now = getSingaporeNow();

  // Select todos for this user where:
  //   - completed = 0
  //   - due_date IS NOT NULL AND reminder_minutes IS NOT NULL
  //   - the reminder window has opened: due_date - reminder_minutes <= now
  //   - the todo is not yet past due beyond a reasonable grace window (optional; avoids
  //     firing very stale reminders after a long-closed tab reopens — see Edge Cases)
  //   - last_notification_sent IS NULL
  //     OR last_notification_sent was recorded for a due_date/reminder_minutes pair
  //       that no longer matches (i.e. the todo was edited after the last notification —
  //       in practice this is enforced by clearing last_notification_sent on edit, see below,
  //       so the query itself only ever needs to check `last_notification_sent IS NULL`)

  const dueReminders = db.prepare(`
    SELECT * FROM todos
    WHERE user_id = ?
      AND completed = 0
      AND due_date IS NOT NULL
      AND reminder_minutes IS NOT NULL
      AND last_notification_sent IS NULL
      AND datetime(due_date, '-' || reminder_minutes || ' minutes') <= datetime(?)
  `).all(session.userId, formatSingaporeDate(now, 'yyyy-MM-dd HH:mm:ss'));

  return NextResponse.json({ success: true, data: dueReminders });
}
```

A companion call marks a reminder as sent once the client has actually shown the notification:

```typescript
// PUT /api/todos/[id] (existing endpoint from PRP 01) — client sends:
// { last_notification_sent: <ISO timestamp of now> }
```

`last_notification_sent` MUST be reset to `null` whenever `due_date` or `reminder_minutes` changes on that todo (enforced in the PRP 01 `PUT /api/todos/[id]` handler when either field is part of the update payload), so an edited todo becomes eligible for a fresh reminder.

### Client Polling (`lib/hooks/useNotifications.ts`)

```typescript
export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');

  const requestPermission = useCallback(async () => {
    const result = await Notification.requestPermission();
    setPermission(result);
  }, []);

  useEffect(() => {
    if (permission !== 'granted') return;

    const poll = async () => {
      const res = await fetch('/api/notifications/check');
      if (!res.ok) return;
      const { data: dueTodos } = await res.json();

      for (const todo of dueTodos) {
        new Notification(todo.title, {
          body: `Due ${formatSingaporeDate(todo.due_date)}`,
          tag: `todo-${todo.id}`, // prevents the OS from stacking duplicate notifications for the same todo
        });
        await fetch(`/api/todos/${todo.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ last_notification_sent: getSingaporeNow().toISOString() }),
        });
      }
    };

    poll();
    const interval = setInterval(poll, 30_000); // 30 seconds
    return () => clearInterval(interval);
  }, [permission]);

  return { permission, requestPermission };
}
```

## UI Components

**Enable Notifications button** — two visual states:

```tsx
function NotificationToggle() {
  const { permission, requestPermission } = useNotifications();
  const enabled = permission === 'granted';

  return (
    <button
      onClick={requestPermission}
      disabled={enabled}
      className={enabled ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-orange-500 text-white hover:bg-orange-600'}
    >
      {enabled ? '🔔 Notifications On' : '🔔 Enable Notifications'}
    </button>
  );
}
```

**Reminder select** — disabled without a due date:

```tsx
<select
  value={reminderMinutes ?? ''}
  disabled={!dueDate}
  onChange={(e) => setReminderMinutes(e.target.value ? Number(e.target.value) as ReminderMinutes : null)}
>
  <option value="">None</option>
  <option value={15}>15 minutes before</option>
  <option value={30}>30 minutes before</option>
  <option value={60}>1 hour before</option>
  <option value={120}>2 hours before</option>
  <option value={1440}>1 day before</option>
  <option value={2880}>2 days before</option>
  <option value={10080}>1 week before</option>
</select>
```

**Reminder badge**:

```tsx
function ReminderBadge({ minutes }: { minutes: ReminderMinutes }) {
  return <span className="reminder-badge">🔔 {REMINDER_LABELS[minutes]}</span>;
}
```

## Edge Cases

- **Due date edited after a reminder already fired**: `last_notification_sent` is cleared (set to `null`) whenever `due_date` or `reminder_minutes` is updated, so the reminder becomes eligible to fire again for the new window. This is intentional — a moved deadline deserves a fresh heads-up.
- **Reminder timing changed after firing**: same rule applies — changing `reminder_minutes` clears `last_notification_sent`.
- **Browser permission revoked mid-session**: `useNotifications` reflects `Notification.permission` on next poll tick; if revoked, the hook stops firing (attempting `new Notification()` without permission throws/no-ops depending on browser — guard with a permission check before calling it, not just at hook-mount time).
- **Tab closed before reminder time**: the notification simply never fires — there is no server push / service worker in this design, so reminders only fire while a tab with the app open is polling. This is a documented limitation, not a bug.
- **Multiple tabs open**: dedup is enforced server-side via `last_notification_sent`, not client state, so only one tab's PUT call actually "wins" the notification-sent flag — but both tabs may independently call `new Notification()` in the same ~30s window before either PUT lands, risking a double OS notification. Mitigate with the `tag` option (shown above) so the OS coalesces same-tag notifications, and treat true exactly-once delivery as best-effort rather than guaranteed.
- **Stale/very overdue reminder on reopen**: if a user closes their laptop for three days, on reopen the check endpoint would still return long-overdue reminders (they satisfy the window condition and `last_notification_sent IS NULL`). This is acceptable — better a late reminder than a silently dropped one — but implementers may optionally cap the query to reminders whose window opened within, say, the last 24 hours, to avoid a flood of stale notifications. Document whichever choice is made.
- **Clock skew between client and Singapore server time**: all comparisons happen server-side in `/api/notifications/check` using `getSingaporeNow()`, so client clock drift cannot cause a reminder to fire early/late — the client is purely a polling trigger, not a timing authority.
- **Recurring todo's next instance**: the new instance is created with `last_notification_sent: null` and the same `reminder_minutes`, so its own reminder window is evaluated independently (see PRP 03).

## Acceptance Criteria

- [ ] "Enable Notifications" button requests browser permission and reflects granted/not-granted state
- [ ] Reminder dropdown offers exactly 7 timing options plus "None"
- [ ] Reminder dropdown is disabled when no due date is set
- [ ] `GET /api/notifications/check` returns only todos whose reminder window has opened and that haven't been notified yet
- [ ] A notification fires within one polling interval (~30s) of the reminder window opening
- [ ] Each reminder fires exactly once per due_date/reminder_minutes pair (verified via `last_notification_sent`)
- [ ] Editing `due_date` or `reminder_minutes` clears `last_notification_sent`, re-arming the reminder
- [ ] 🔔 badge renders the correct abbreviation for each of the 7 presets
- [ ] All reminder-time comparisons use Singapore timezone, not UTC or client-local time

## Testing Requirements

**Unit tests**:
- [ ] `/api/notifications/check` query logic: todo just inside the window is returned, just outside is not (boundary test at the exact `due_date - reminder_minutes` instant)
- [ ] `last_notification_sent IS NOT NULL` correctly excludes an already-notified todo
- [ ] Reminder-minutes-to-window math is correct for all 7 presets, including day/week conversions across a Singapore date boundary

**E2E tests** (`tests/06-reminders.spec.ts`):
- [ ] Set each of the 7 reminder options on a todo and verify the correct 🔔 badge abbreviation
- [ ] Reminder dropdown is disabled/enabled correctly based on due date presence
- [ ] `GET /api/notifications/check` returns the expected shape and todo list for a seeded due-soon todo
- [ ] Editing due date resets notification eligibility (verified via API state, not the OS notification itself)

**Manual tests** (full end-to-end notification firing is not reliably automatable — browser permission prompts and OS-level notification rendering fall outside Playwright's control):
- [ ] Enable notifications, create a todo due in ~2 minutes with a 1-minute-equivalent-short reminder for testing, confirm a real browser notification appears
- [ ] Verify no duplicate notification fires on a second poll tick for the same reminder

## Out of Scope

- Email, SMS, or push notifications (browser Notification API only)
- Snooze / "remind me again in X minutes" functionality
- Custom/arbitrary reminder offsets beyond the 7 fixed presets
- Notification history or an in-app log of past reminders
- Service-worker-based background notifications when the tab/browser is fully closed

## Success Metrics

- Notification fires within 30 seconds of the correct trigger time in ≥95% of cases
- Zero duplicate notifications recorded per reminder window in testing (OS-level double-fire from multi-tab races is a known, documented best-effort limitation, not a regression)
- `/api/notifications/check` polling adds negligible measurable CPU/network overhead (single lightweight GET every 30s)
- 100% of reminder-time comparisons pass Singapore-timezone-boundary unit tests
