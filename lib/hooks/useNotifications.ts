'use client';
import { useState } from 'react';

export function useNotifications() {
  const [enabled, setEnabled] = useState(
    typeof window !== 'undefined' && Notification.permission === 'granted'
  );

  async function requestPermission() {
    const permission = await Notification.requestPermission();
    setEnabled(permission === 'granted');
    return permission === 'granted';
  }

  return { enabled, requestPermission };
}
