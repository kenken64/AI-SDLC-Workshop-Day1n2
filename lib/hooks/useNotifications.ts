'use client';
/**
 * lib/hooks/useNotifications.ts — client-side polling hook for due-date reminders.
 *
 * Owner: Person C (Wave 3).
 * Polls GET /api/notifications/check every 30 s and fires browser Notifications
 * for any todos whose reminder window has opened.  Marks each as sent via
 * PUT /api/todos/[id] so duplicates never fire.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Todo } from '@/lib/db';

function formatDueDate(dueDate: string): string {
  try {
    // Stored as Singapore-local ISO without offset — append +08:00 for correct parsing.
    const normalized = dueDate.length === 16 ? `${dueDate}:00` : dueDate;
    const d = new Date(`${normalized}+08:00`);
    return new Intl.DateTimeFormat('en-SG', {
      timeZone: 'Asia/Singapore',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return dueDate;
  }
}

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');

  // Sync initial permission state from the browser on mount.
  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }, []);

  useEffect(() => {
    if (permission !== 'granted') return;

    const poll = async () => {
      // Re-check permission on each tick in case the user revoked it.
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

      let dueTodos: Todo[] = [];
      try {
        const res = await fetch('/api/notifications/check');
        if (!res.ok) return;
        const body = (await res.json()) as { data: Todo[] };
        dueTodos = body.data ?? [];
      } catch {
        return;
      }

      for (const todo of dueTodos) {
        new Notification(todo.title, {
          body: `Due ${todo.due_date ? formatDueDate(todo.due_date) : 'soon'}`,
          // `tag` coalesces OS-level duplicate toasts from multiple open tabs.
          tag: `todo-${todo.id}`,
        });

        // Stamp last_notification_sent so this reminder never fires again for
        // the current due_date/reminder_minutes pair.
        await fetch(`/api/todos/${todo.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ last_notification_sent: new Date().toISOString() }),
        });
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), 30_000);
    return () => clearInterval(interval);
  }, [permission]);

  return { permission, requestPermission };
}
