"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface NotificationTodo {
  id: string;
  title: string;
  due_date: string | null;
  reminder_minutes: number | null;
}

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const enabled = useMemo(() => permission === "granted", [permission]);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    return result === "granted";
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timer = window.setInterval(async () => {
      const response = await fetch("/api/notifications/check", {
        method: "POST",
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { notifications: NotificationTodo[] };

      for (const todo of payload.notifications) {
        const suffix = todo.due_date ? `Due at ${new Date(todo.due_date).toLocaleString()}` : "No due date";
        new Notification(`Todo reminder: ${todo.title}`, {
          body: suffix,
        });
      }
    }, 30_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [enabled]);

  return {
    enabled,
    permission,
    requestPermission,
  };
}
