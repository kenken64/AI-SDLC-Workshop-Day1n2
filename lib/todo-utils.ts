import type { Priority, ReminderMinutes, Todo } from './db';

export const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const REMINDER_LABELS: Record<ReminderMinutes, string> = {
  15: '15m',
  30: '30m',
  60: '1h',
  120: '2h',
  1440: '1d',
  2880: '2d',
  10080: '1w',
};

export function validatePriority(value: unknown): Priority {
  if (value === undefined || value === null) {
    return 'medium';
  }

  if (value === 'high' || value === 'medium' || value === 'low') {
    return value;
  }

  throw new Error(`Invalid priority: ${String(value)}. Must be 'high', 'medium', or 'low'.`);
}

export function compareTodos(a: Todo, b: Todo): number {
  const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (priorityDiff !== 0) return priorityDiff;

  const aDue = a.due_date ? parseSingaporeDateTime(a.due_date).getTime() : Infinity;
  const bDue = b.due_date ? parseSingaporeDateTime(b.due_date).getTime() : Infinity;
  if (aDue !== bDue) return aDue - bDue;

  return parseSingaporeDateTime(b.created_at).getTime() - parseSingaporeDateTime(a.created_at).getTime();
}

export function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort(compareTodos);
}

export function sectionTodos(todos: Todo[], now = new Date()): {
  overdue: Todo[];
  pending: Todo[];
  completed: Todo[];
} {
  const current = now.getTime();
  const incomplete = todos.filter((todo) => !todo.completed);

  const overdue = sortTodos(
    incomplete.filter((todo) => todo.due_date && parseSingaporeDateTime(todo.due_date).getTime() < current),
  );
  const pending = sortTodos(
    incomplete.filter((todo) => !todo.due_date || parseSingaporeDateTime(todo.due_date).getTime() >= current),
  );
  const completed = [...todos]
    .filter((todo) => todo.completed)
    .sort(
      (a, b) =>
        parseSingaporeDateTime(b.updated_at ?? b.created_at).getTime() -
        parseSingaporeDateTime(a.updated_at ?? a.created_at).getTime(),
    );

  return { overdue, pending, completed };
}

export function parseSingaporeDateTime(value: string): Date {
  if (value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(value)) {
    return new Date(value);
  }

  const normalized = value.length === 16 ? `${value}:00` : value;
  return new Date(`${normalized}+08:00`);
}

export function normalizeSingaporeDateInput(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error('Due date must be a string');
  }

  const parsed = parseSingaporeDateTime(value.trim());
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Due date is invalid');
  }

  return formatSingaporeLocal(parsed);
}

export function formatSingaporeLocal(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

export function formatForDateTimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 16);
}
