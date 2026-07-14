'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { Priority, RecurrencePattern, ReminderMinutes, Todo } from '@/lib/db';
import {
  PRIORITY_LABELS,
  REMINDER_LABELS,
  formatForDateTimeLocal,
  formatSingaporeLocal,
  parseSingaporeDateTime,
  sectionTodos,
  sortTodos,
  validatePriority,
} from '@/lib/todo-utils';
import { useNotifications } from '@/lib/hooks/useNotifications';

type PriorityFilter = Priority | 'all';

type TodoDraft = {
  title: string;
  priority: Priority;
  dueDate: string;
  isRecurring: boolean;
  recurrencePattern: RecurrencePattern;
  reminderMinutes: ReminderMinutes | null;
};

type EditDraft = {
  title: string;
  priority: Priority;
  dueDate: string;
  completed: boolean;
  isRecurring: boolean;
  recurrencePattern: RecurrencePattern;
  reminderMinutes: ReminderMinutes | null;
};

const EMPTY_DRAFT: TodoDraft = {
  title: '',
  priority: 'medium',
  dueDate: '',
  isRecurring: false,
  recurrencePattern: 'weekly',
  reminderMinutes: null,
};

const PRIORITY_FILTER_OPTIONS: Array<{ value: PriorityFilter; label: string }> = [
  { value: 'all', label: 'All Priorities' },
  { value: 'high', label: 'High Priority' },
  { value: 'medium', label: 'Medium Priority' },
  { value: 'low', label: 'Low Priority' },
];

const PRIORITY_BADGE_STYLES: Record<Priority, string> = {
  high: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300',
  medium: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
  low: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300',
};

function parseFormDate(value: string): string | null {
  if (!value) return null;
  return value.length === 16 ? `${value}:00` : value;
}

function formatCardDate(value: string | null): string {
  if (!value) return 'No due date';

  const parsed = parseSingaporeDateTime(value);
  if (Number.isNaN(parsed.getTime())) return 'No due date';

  return new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function updateTodoList(todos: Todo[], updated: Todo): Todo[] {
  return todos.map((todo) => (todo.id === updated.id ? updated : todo));
}

function removeTodoFromList(todos: Todo[], id: number): Todo[] {
  return todos.filter((todo) => todo.id !== id);
}

function makeOptimisticTodo(draft: TodoDraft): Todo {
  return {
    id: -Date.now(),
    user_id: 0,
    title: draft.title,
    completed: false,
    due_date: parseFormDate(draft.dueDate),
    priority: draft.priority,
    is_recurring: draft.isRecurring,
    recurrence_pattern: draft.isRecurring ? draft.recurrencePattern : null,
    reminder_minutes: draft.reminderMinutes,
    last_notification_sent: null,
    created_at: formatSingaporeLocal(new Date()),
    updated_at: null,
  };
}

function TodoBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE_STYLES[priority]}`}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

function RecurrenceBadge({ pattern }: { pattern: RecurrencePattern }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-purple-300 bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:border-purple-700 dark:bg-purple-900/40 dark:text-purple-200">
      🔄 {pattern}
    </span>
  );
}

function ReminderBadge({ minutes }: { minutes: number }) {
  const label = REMINDER_LABELS[minutes as ReminderMinutes] ?? `${minutes}m`;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-200">
      🔔 {label}
    </span>
  );
}

function SectionCard({
  title,
  count,
  tone,
  todos,
  onToggle,
  onEdit,
  onDelete,
}: {
  title: string;
  count: number;
  tone: string;
  todos: Todo[];
  onToggle: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className={`text-lg font-semibold ${tone}`}>{title}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{count} item{count === 1 ? '' : 's'}</p>
        </div>
      </div>

      <div className="space-y-3">
        {todos.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Nothing here yet.
          </p>
        ) : (
          todos.map((todo) => (
            <article
              key={todo.id}
              className="rounded-2xl border border-slate-200 bg-slate-50/75 p-4 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => onToggle(todo)}
                    aria-label={`${todo.completed ? 'Mark' : 'Complete'} ${todo.title}`}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`text-base font-medium ${todo.completed ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-white'}`}>
                        {todo.title}
                      </h3>
                      <TodoBadge priority={todo.priority} />
                      {todo.is_recurring && todo.recurrence_pattern && (
                        <RecurrenceBadge pattern={todo.recurrence_pattern} />
                      )}
                      {todo.reminder_minutes !== null && todo.reminder_minutes !== undefined && (
                        <ReminderBadge minutes={todo.reminder_minutes} />
                      )}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{formatCardDate(todo.due_date)}</p>
                  </div>
                </div>

                <div className="flex gap-2 self-start">
                  <button
                    type="button"
                    onClick={() => onEdit(todo)}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(todo)}
                    className="rounded-xl border border-red-300 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export default function HomePage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TodoDraft>(EMPTY_DRAFT);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [saving, setSaving] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const { permission: notificationPermission, requestPermission } = useNotifications();

  useEffect(() => {
    let active = true;

    async function loadTodos() {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/todos');
      if (!active) return;

      if (!response.ok) {
        setError('Unable to load todos right now.');
        setLoading(false);
        return;
      }

      const data = (await response.json()) as Todo[];
      setTodos(data);
      setLoading(false);
    }

    void loadTodos();

    return () => {
      active = false;
    };
  }, []);

  const visibleTodos = priorityFilter === 'all'
    ? todos
    : todos.filter((todo) => todo.priority === priorityFilter);

  const sections = sectionTodos(visibleTodos, new Date());

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();

    if (!title) {
      setError('Title is required.');
      return;
    }

    const optimisticTodo = makeOptimisticTodo({ ...draft, title });
    const previousDraft = draft;
    setSaving(true);
    setError(null);
    setTodos((current) => sortTodos([...current, optimisticTodo]));
    setDraft(EMPTY_DRAFT);

    try {
      const response = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          priority: draft.priority,
          due_date: parseFormDate(draft.dueDate),
          is_recurring: draft.isRecurring,
          recurrence_pattern: draft.isRecurring ? draft.recurrencePattern : null,
          reminder_minutes: draft.reminderMinutes,
        }),
      });

      const payload = await response.json().catch(() => null) as Todo | { error?: string } | null;
      if (!response.ok || !payload || typeof (payload as { error?: string }).error === 'string') {
        throw new Error((payload as { error?: string } | null)?.error ?? 'Unable to create todo.');
      }

      const created = payload as Todo;
      setTodos((current) => sortTodos(current.map((todo) => (todo.id === optimisticTodo.id ? created : todo))));
    } catch (mutationError) {
      setTodos((current) => current.filter((todo) => todo.id !== optimisticTodo.id));
      setError(mutationError instanceof Error ? mutationError.message : 'Unable to create todo.');
      setDraft(previousDraft);
    } finally {
      setSaving(false);
    }
  }

  function openEdit(todo: Todo) {
    setEditingTodo(todo);
    setEditDraft({
      title: todo.title,
      priority: todo.priority,
      dueDate: formatForDateTimeLocal(todo.due_date),
      completed: todo.completed,
      isRecurring: todo.is_recurring,
      recurrencePattern: todo.recurrence_pattern ?? 'weekly',
      reminderMinutes: (todo.reminder_minutes as ReminderMinutes | null) ?? null,
    });
    setEditError(null);
  }

  function closeEdit() {
    setEditingTodo(null);
    setEditDraft(null);
    setEditError(null);
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTodo || !editDraft) return;

    const title = editDraft.title.trim();
    if (!title) {
      setEditError('Title cannot be empty.');
      return;
    }

    const optimisticUpdate: Todo = {
      ...editingTodo,
      title,
      priority: editDraft.priority,
      due_date: parseFormDate(editDraft.dueDate),
      completed: editDraft.completed,
      is_recurring: editDraft.isRecurring,
      recurrence_pattern: editDraft.isRecurring ? editDraft.recurrencePattern : null,
      reminder_minutes: editDraft.reminderMinutes,
      updated_at: formatSingaporeLocal(new Date()),
    };

    const snapshot = todos;
    setEditSaving(true);
    setEditError(null);
    setTodos((current) => sortTodos(updateTodoList(current, optimisticUpdate)));

    try {
      const response = await fetch(`/api/todos/${editingTodo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          priority: editDraft.priority,
          due_date: parseFormDate(editDraft.dueDate),
          completed: editDraft.completed,
          is_recurring: editDraft.isRecurring,
          recurrence_pattern: editDraft.isRecurring ? editDraft.recurrencePattern : null,
          reminder_minutes: editDraft.reminderMinutes,
        }),
      });

      const payload = await response.json().catch(() => null) as { todo: Todo; nextInstance?: Todo } | { error?: string } | null;
      if (!response.ok || !payload || typeof (payload as { error?: string }).error === 'string') {
        throw new Error((payload as { error?: string } | null)?.error ?? 'Unable to update todo.');
      }

      const { todo: updatedTodo } = payload as { todo: Todo };
      setTodos((current) => sortTodos(updateTodoList(current, updatedTodo)));
      closeEdit();
    } catch (mutationError) {
      setTodos(snapshot);
      setEditError(mutationError instanceof Error ? mutationError.message : 'Unable to update todo.');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleToggle(todo: Todo) {
    const optimisticTodo: Todo = {
      ...todo,
      completed: !todo.completed,
      updated_at: formatSingaporeLocal(new Date()),
    };

    const snapshot = todos;
    setTodos((current) => sortTodos(updateTodoList(current, optimisticTodo)));

    try {
      const response = await fetch(`/api/todos/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !todo.completed }),
      });

      const payload = await response.json().catch(() => null) as
        | { todo: Todo; nextInstance?: Todo }
        | { error?: string }
        | null;
      if (!response.ok || !payload || typeof (payload as { error?: string }).error === 'string') {
        throw new Error((payload as { error?: string } | null)?.error ?? 'Unable to update todo.');
      }

      const { todo: updatedTodo, nextInstance } = payload as { todo: Todo; nextInstance?: Todo };
      setTodos((current) => {
        const withUpdate = updateTodoList(current, updatedTodo);
        return nextInstance ? sortTodos([...withUpdate, nextInstance]) : sortTodos(withUpdate);
      });
    } catch (mutationError) {
      setTodos(snapshot);
      setError(mutationError instanceof Error ? mutationError.message : 'Unable to update todo.');
    }
  }

  async function handleDelete(todo: Todo) {
    const snapshot = todos;
    setTodos((current) => removeTodoFromList(current, todo.id));

    try {
      const response = await fetch(`/api/todos/${todo.id}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => null) as { error?: string; success?: boolean } | null;
      if (!response.ok || (payload && payload.success !== true && payload.error)) {
        throw new Error(payload?.error ?? 'Unable to delete todo.');
      }
    } catch (mutationError) {
      setTodos(snapshot);
      setError(mutationError instanceof Error ? mutationError.message : 'Unable to delete todo.');
    }
  }

  const sectionTitles = {
    overdue: 'Overdue',
    pending: 'Pending',
    completed: 'Completed',
  } as const;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.16),_transparent_34%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_56%,_#eff6ff_100%)] px-4 py-10 text-slate-900 dark:bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.2),_transparent_34%),linear-gradient(180deg,_#020617_0%,_#0f172a_56%,_#111827_100%)] dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="rounded-[2rem] border border-white/60 bg-white/80 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-blue-600 dark:text-blue-400">Todo App</p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Capture work fast, keep priority visible.</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Add todos, sort them by urgency, and keep the list organized without leaving the page.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void requestPermission()}
                disabled={notificationPermission === 'granted'}
                className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                  notificationPermission === 'granted'
                    ? 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                    : 'border-orange-300 bg-orange-500 text-white hover:bg-orange-600 dark:border-orange-600'
                }`}
              >
                {notificationPermission === 'granted' ? '🔔 Notifications On' : '🔔 Enable Notifications'}
              </button>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                {loading ? 'Loading todos…' : `${todos.length} total ${todos.length === 1 ? 'item' : 'items'}`}
              </div>
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}
        </header>

        <section className="grid gap-4 rounded-[2rem] border border-slate-200 bg-white/85 p-5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/70 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <form onSubmit={handleCreate} className="grid gap-4">
            <div className="space-y-2">
              <label htmlFor="todo-title" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Title
              </label>
              <input
                id="todo-title"
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="e.g. Draft workshop notes"
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-950/60"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="todo-priority" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Priority
                </label>
                <select
                  id="todo-priority"
                  value={draft.priority}
                  onChange={(event) => setDraft((current) => ({ ...current, priority: validatePriority(event.target.value) }))}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-950/60"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="todo-due-date" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Due date and time
                </label>
                <input
                  id="todo-due-date"
                  type="datetime-local"
                  step={60}
                  value={draft.dueDate}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    dueDate: event.target.value,
                    // Clear recurring/reminder when the due date is removed.
                    isRecurring: event.target.value ? current.isRecurring : false,
                    reminderMinutes: event.target.value ? current.reminderMinutes : null,
                  }))}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-950/60"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={draft.isRecurring}
                    disabled={!draft.dueDate}
                    onChange={(e) => setDraft((cur) => ({ ...cur, isRecurring: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Repeat
                </label>
                {draft.isRecurring ? (
                  <select
                    value={draft.recurrencePattern}
                    onChange={(e) => setDraft((cur) => ({ ...cur, recurrencePattern: e.target.value as RecurrencePattern }))}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-950/60"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                ) : (
                  !draft.dueDate && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Set a due date to enable repeat</p>
                  )
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="todo-reminder" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Reminder
                </label>
                <select
                  id="todo-reminder"
                  value={draft.reminderMinutes ?? ''}
                  disabled={!draft.dueDate}
                  onChange={(e) => setDraft((cur) => ({ ...cur, reminderMinutes: e.target.value ? (Number(e.target.value) as ReminderMinutes) : null }))}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-950/60"
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
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              {saving ? 'Adding…' : 'Add Todo'}
            </button>
          </form>

          <div className="space-y-3 rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <label htmlFor="priority-filter" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Priority filter
            </label>
            <select
              id="priority-filter"
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-950/60"
            >
              {PRIORITY_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
              High priority todos surface first inside each section. Overdue items stay separate from upcoming work.
            </div>
          </div>
        </section>

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="h-64 animate-pulse rounded-[2rem] bg-white/70 dark:bg-slate-900/60" />
            <div className="h-64 animate-pulse rounded-[2rem] bg-white/70 dark:bg-slate-900/60" />
            <div className="h-64 animate-pulse rounded-[2rem] bg-white/70 dark:bg-slate-900/60" />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard
              title={sectionTitles.overdue}
              count={sections.overdue.length}
              tone="text-red-600 dark:text-red-300"
              todos={sections.overdue}
              onToggle={handleToggle}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
            <SectionCard
              title={sectionTitles.pending}
              count={sections.pending.length}
              tone="text-slate-700 dark:text-slate-200"
              todos={sections.pending}
              onToggle={handleToggle}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
            <SectionCard
              title={sectionTitles.completed}
              count={sections.completed.length}
              tone="text-emerald-600 dark:text-emerald-300"
              todos={sections.completed}
              onToggle={handleToggle}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          </div>
        )}
      </div>

      {editingTodo && editDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Edit todo</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">Update details</h2>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                Cancel
              </button>
            </div>

            {editError && (
              <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                {editError}
              </p>
            )}

            <form onSubmit={handleUpdate} className="grid gap-4">
              <div className="space-y-2">
                <label htmlFor="edit-todo-title" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Edit title
                </label>
                <input
                  id="edit-todo-title"
                  value={editDraft.title}
                  onChange={(event) => setEditDraft((current) => current ? { ...current, title: event.target.value } : current)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-950/60"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="edit-todo-priority" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Edit priority
                  </label>
                  <select
                    id="edit-todo-priority"
                    value={editDraft.priority}
                    onChange={(event) => setEditDraft((current) => current ? { ...current, priority: validatePriority(event.target.value) } : current)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-950/60"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="edit-todo-due-date" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Edit due date and time
                  </label>
                  <input
                    id="edit-todo-due-date"
                    type="datetime-local"
                    step={60}
                    value={editDraft.dueDate}
                    onChange={(event) => setEditDraft((current) => current ? { ...current, dueDate: event.target.value } : current)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-950/60"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={editDraft.isRecurring}
                      disabled={!editDraft.dueDate}
                      onChange={(e) => setEditDraft((cur) => cur ? { ...cur, isRecurring: e.target.checked } : cur)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Repeat
                  </label>
                  {editDraft.isRecurring ? (
                    <select
                      value={editDraft.recurrencePattern}
                      onChange={(e) => setEditDraft((cur) => cur ? { ...cur, recurrencePattern: e.target.value as RecurrencePattern } : cur)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-950/60"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  ) : (
                    !editDraft.dueDate && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">Set a due date to enable repeat</p>
                    )
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="edit-todo-reminder" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Reminder
                  </label>
                  <select
                    id="edit-todo-reminder"
                    value={editDraft.reminderMinutes ?? ''}
                    disabled={!editDraft.dueDate}
                    onChange={(e) => setEditDraft((cur) => cur ? { ...cur, reminderMinutes: e.target.value ? (Number(e.target.value) as ReminderMinutes) : null } : cur)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-950/60"
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
                </div>
              </div>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={editDraft.completed}
                  onChange={(event) => setEditDraft((current) => current ? { ...current, completed: event.target.checked } : current)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Completed
              </label>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  {editSaving ? 'Updating…' : 'Update Todo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
