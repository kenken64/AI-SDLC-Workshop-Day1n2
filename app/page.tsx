'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getRelativeDueLabel, isSingaporePast } from '@/lib/timezone';

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = 'high' | 'medium' | 'low';
type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface Todo {
  id: number;
  title: string;
  completed: number;
  priority: Priority;
  due_date: string | null;
  is_recurring: number;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface EditState {
  title: string;
  priority: Priority;
  due_date: string;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern;
}

const PRIORITY_COLORS: Record<Priority, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};

const RECURRENCE_LABELS: Record<RecurrencePattern, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNowPlusMins(mins: number): string {
  const d = new Date(Date.now() + mins * 60000);
  return d.toISOString().slice(0, 16);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORITY_COLORS[priority]}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}

function RecurrenceBadge({ pattern }: { pattern: RecurrencePattern }) {
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-300 dark:border-purple-700">
      🔄 {RECURRENCE_LABELS[pattern]}
    </span>
  );
}

function DueLabel({ due_date }: { due_date: string | null }) {
  if (!due_date) return null;
  const { label, color } = getRelativeDueLabel(due_date);
  return <span className={`text-xs ${color}`}>{label}</span>;
}

function TodoItem({
  todo,
  onToggle,
  onEdit,
  onDelete,
}: {
  todo: Todo;
  onToggle: (id: number, completed: boolean) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      data-testid="todo-item"
      className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
        todo.completed
          ? 'opacity-60 bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      }`}
    >
      <input
        type="checkbox"
        checked={!!todo.completed}
        aria-label={todo.title}
        onChange={() => onToggle(todo.id, !todo.completed)}
        className="mt-1 w-4 h-4 cursor-pointer accent-blue-600"
      />
      <div className="flex-1 min-w-0">
        <p className={`font-medium text-gray-900 dark:text-white ${todo.completed ? 'line-through text-gray-500 dark:text-gray-400' : ''}`}>
          {todo.title}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <PriorityBadge priority={todo.priority} />
          {!!todo.is_recurring && todo.recurrence_pattern && (
            <RecurrenceBadge pattern={todo.recurrence_pattern} />
          )}
          <DueLabel due_date={todo.due_date} />
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onEdit(todo)}
          className="text-blue-600 dark:text-blue-400 text-sm hover:underline"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(todo.id)}
          className="text-red-600 dark:text-red-400 text-sm hover:underline"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  todos,
  onToggle,
  onEdit,
  onDelete,
  variant = 'default',
  testId,
}: {
  title: string;
  todos: Todo[];
  onToggle: (id: number, completed: boolean) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (id: number) => void;
  variant?: 'overdue' | 'default';
  testId?: string;
}) {
  if (todos.length === 0) return null;
  return (
    <div
      data-testid={testId}
      className={`rounded-xl p-4 ${variant === 'overdue' ? 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-900/50'}`}
    >
      <h2 className={`font-semibold mb-3 ${variant === 'overdue' ? 'text-red-700 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
        {variant === 'overdue' ? '⚠️ ' : ''}{title} ({todos.length})
      </h2>
      <div className="space-y-2">
        {todos.map((todo) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();

  // Todos state
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New todo form
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [newRecurring, setNewRecurring] = useState(false);
  const [newPattern, setNewPattern] = useState<RecurrencePattern>('weekly');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  // Filters
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');

  // Edit modal
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editState, setEditState] = useState<EditState>({
    title: '', priority: 'medium', due_date: '', is_recurring: false, recurrence_pattern: 'weekly',
  });
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch todos
  const fetchTodos = useCallback(async () => {
    try {
      const res = await fetch('/api/todos');
      if (!res.ok) throw new Error('Failed to fetch');
      setTodos(await res.json());
    } catch {
      setError('Failed to load todos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  // ── Categorise todos ────────────────────────────────────────────────────────
  const filteredTodos = filterPriority === 'all' ? todos : todos.filter(t => t.priority === filterPriority);
  const overdue = filteredTodos.filter(t => !t.completed && t.due_date && isSingaporePast(t.due_date));
  const pending = filteredTodos.filter(t => !t.completed && !(t.due_date && isSingaporePast(t.due_date)));
  const completed = filteredTodos.filter(t => !!t.completed);

  // ── Add todo ────────────────────────────────────────────────────────────────
  async function handleAdd() {
    if (!newTitle.trim()) { setAddError('Title is required'); return; }
    setAddError(''); setAdding(true);
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          priority: newPriority,
          due_date: newDueDate || null,
          is_recurring: newRecurring,
          recurrence_pattern: newRecurring ? newPattern : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to add');
      setTodos(prev => [...prev, data]);
      setNewTitle(''); setNewDueDate(''); setNewRecurring(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add todo');
    } finally {
      setAdding(false);
    }
  }

  // ── Toggle completion ───────────────────────────────────────────────────────
  async function handleToggle(id: number, completed: boolean) {
    const original = todos.find(t => t.id === id);
    if (!original) return;

    // Optimistic update
    setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: completed ? 1 : 0 } : t));

    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
      if (!res.ok) {
        setTodos(prev => prev.map(t => t.id === id ? original : t));
        return;
      }
      // Refresh to pick up any new recurring instance
      await fetchTodos();
    } catch {
      setTodos(prev => prev.map(t => t.id === id ? original : t));
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete(id: number) {
    setTodos(prev => prev.filter(t => t.id !== id));
    try {
      await fetch(`/api/todos/${id}`, { method: 'DELETE' });
    } catch {
      fetchTodos();
    }
  }

  // ── Edit ────────────────────────────────────────────────────────────────────
  function openEdit(todo: Todo) {
    setEditingTodo(todo);
    setEditState({
      title: todo.title,
      priority: todo.priority,
      due_date: todo.due_date ?? '',
      is_recurring: !!todo.is_recurring,
      recurrence_pattern: todo.recurrence_pattern ?? 'weekly',
    });
    setEditError('');
  }

  async function handleSave() {
    if (!editingTodo) return;
    if (!editState.title.trim()) { setEditError('Title is required'); return; }
    setEditError(''); setSaving(true);
    try {
      const res = await fetch(`/api/todos/${editingTodo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editState.title,
          priority: editState.priority,
          due_date: editState.due_date || null,
          is_recurring: editState.is_recurring,
          recurrence_pattern: editState.is_recurring ? editState.recurrence_pattern : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to update');
      setTodos(prev => prev.map(t => t.id === editingTodo.id ? data : t));
      setEditingTodo(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Loading…</p>
      </div>
    );
  }

  const minDue = getNowPlusMins(1);

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">📝 My Todos</h1>
          <button
            onClick={() => router.push('/calendar')}
            className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            📅 Calendar
          </button>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Add Todo Form */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 space-y-3">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Add Todo</h2>

          <input
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="What needs to be done?"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />

          <div className="flex flex-wrap gap-2">
            <select
              value={newPriority}
              onChange={e => setNewPriority(e.target.value as Priority)}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="high">🔴 High</option>
              <option value="medium">🟡 Medium</option>
              <option value="low">🔵 Low</option>
            </select>

            <input
              type="datetime-local"
              value={newDueDate}
              min={minDue}
              onChange={e => setNewDueDate(e.target.value)}
              className="flex-1 min-w-40 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Recurring toggle */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={newRecurring}
                onChange={e => setNewRecurring(e.target.checked)}
                className="w-4 h-4 accent-purple-600"
              />
              🔄 Repeat
            </label>
            {newRecurring && (
              <select
                value={newPattern}
                onChange={e => setNewPattern(e.target.value as RecurrencePattern)}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            )}
            {newRecurring && !newDueDate && (
              <p className="text-amber-600 dark:text-amber-400 text-xs">⚠️ Recurring todos need a due date</p>
            )}
          </div>

          {addError && <p className="text-red-600 dark:text-red-400 text-xs">{addError}</p>}

          <button
            onClick={handleAdd}
            disabled={adding}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors text-sm"
          >
            {adding ? 'Adding…' : '+ Add'}
          </button>
        </div>

        {/* Priority Filter */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter:</label>
          <select
            data-testid="priority-filter"
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value as Priority | 'all')}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
        </div>

        {/* Todo Sections */}
        <Section title="Overdue" todos={overdue} onToggle={handleToggle} onEdit={openEdit} onDelete={handleDelete} variant="overdue" testId="overdue-section" />
        <Section title="Pending" todos={pending} onToggle={handleToggle} onEdit={openEdit} onDelete={handleDelete} testId="pending-section" />
        <Section title="Completed" todos={completed} onToggle={handleToggle} onEdit={openEdit} onDelete={handleDelete} testId="completed-section" />

        {todos.length === 0 && (
          <p className="text-center text-gray-500 dark:text-gray-400 py-12">
            No todos yet. Add your first one above!
          </p>
        )}
      </div>

      {/* Edit Modal */}
      {editingTodo && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={e => { if (e.target === e.currentTarget) setEditingTodo(null); }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Edit Todo</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
              <input
                type="text"
                value={editState.title}
                onChange={e => setEditState(s => ({ ...s, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
              <select
                value={editState.priority}
                onChange={e => setEditState(s => ({ ...s, priority: e.target.value as Priority }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="high">🔴 High</option>
                <option value="medium">🟡 Medium</option>
                <option value="low">🔵 Low</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</label>
              <input
                type="datetime-local"
                value={editState.due_date}
                min={minDue}
                onChange={e => setEditState(s => ({ ...s, due_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={editState.is_recurring}
                  onChange={e => setEditState(s => ({ ...s, is_recurring: e.target.checked }))}
                  className="w-4 h-4 accent-purple-600"
                />
                🔄 Repeat
              </label>
              {editState.is_recurring && (
                <select
                  value={editState.recurrence_pattern}
                  onChange={e => setEditState(s => ({ ...s, recurrence_pattern: e.target.value as RecurrencePattern }))}
                  className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              )}
            </div>

            {editError && <p className="text-red-600 dark:text-red-400 text-xs">{editError}</p>}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setEditingTodo(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium py-2 rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors text-sm"
              >
                {saving ? 'Saving…' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
