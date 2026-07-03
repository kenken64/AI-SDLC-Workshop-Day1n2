'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getRelativeDueLabel, isSingaporePast, formatSingaporeDate } from '@/lib/timezone';
import { useNotifications } from '@/lib/hooks/useNotifications';

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = 'high' | 'medium' | 'low';
type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: number;
  position: number;
  created_at: string;
}

interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
}

interface Todo {
  id: number;
  title: string;
  completed: number;
  priority: Priority;
  due_date: string | null;
  is_recurring: number;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  subtasks: Subtask[];
  tags: Tag[];
}

interface EditState {
  title: string;
  priority: Priority;
  due_date: string;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern;
  reminder_minutes: number | null;
}

interface Template {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  category: string | null;
  title_template: string;
  priority: Priority;
  is_recurring: number;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  subtasks_json: string | null;
  created_at: string;
}

interface FilterState {
  search: string;
  priority: Priority | 'all';
  tagId: number | null;
  completion: 'all' | 'incomplete' | 'completed';
  dateFrom: string;
  dateTo: string;
}

interface FilterPreset {
  id: string;
  name: string;
  filters: FilterState;
}

const DEFAULT_FILTERS: FilterState = {
  search: '',
  priority: 'all',
  tagId: null,
  completion: 'all',
  dateFrom: '',
  dateTo: '',
};

const PRIORITY_COLORS: Record<Priority, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};

const RECURRENCE_LABELS: Record<RecurrencePattern, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly',
};

const REMINDER_OPTIONS = [
  { value: null,  label: 'None' },
  { value: 15,    label: '15 minutes before' },
  { value: 30,    label: '30 minutes before' },
  { value: 60,    label: '1 hour before' },
  { value: 120,   label: '2 hours before' },
  { value: 1440,  label: '1 day before' },
  { value: 2880,  label: '2 days before' },
  { value: 10080, label: '1 week before' },
] as const;

const REMINDER_LABELS: Record<number, string> = {
  15: '15m', 30: '30m', 60: '1h', 120: '2h', 1440: '1d', 2880: '2d', 10080: '1w',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNowPlusMins(mins: number): string {
  const d = new Date(Date.now() + mins * 60000);
  return d.toISOString().slice(0, 16);
}

function applyFilters(todos: Todo[], f: FilterState): Todo[] {
  return todos.filter(todo => {
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!todo.title.toLowerCase().includes(q) && !todo.subtasks.some(s => s.title.toLowerCase().includes(q))) return false;
    }
    if (f.priority !== 'all' && todo.priority !== f.priority) return false;
    if (f.tagId !== null && !todo.tags.some(t => t.id === f.tagId)) return false;
    if (f.completion === 'incomplete' && !!todo.completed) return false;
    if (f.completion === 'completed' && !todo.completed) return false;
    if (f.dateFrom && todo.due_date && todo.due_date.slice(0, 10) < f.dateFrom) return false;
    if (f.dateTo && todo.due_date && todo.due_date.slice(0, 10) > f.dateTo) return false;
    return true;
  });
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

function ReminderBadge({ minutes }: { minutes: number | null }) {
  if (!minutes) return null;
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
      {`\uD83D\uDD14`} {REMINDER_LABELS[minutes] ?? `${minutes}m`}
    </span>
  );
}

function TagPill({ tag }: { tag: Tag }) {
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
      style={{ backgroundColor: tag.color }}
    >
      {tag.name}
    </span>
  );
}

function TagSelector({
  allTags,
  selectedIds,
  onToggle,
}: {
  allTags: Tag[];
  selectedIds: number[];
  onToggle: (id: number) => void;
}) {
  if (allTags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {allTags.map(tag => {
        const selected = selectedIds.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => onToggle(tag.id)}
            className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
              selected ? 'text-white border-transparent' : 'text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'
            }`}
            style={selected ? { backgroundColor: tag.color } : {}}
          >
            {selected && '\u2713 '}{tag.name}
          </button>
        );
      })}
    </div>
  );
}

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  if (total === 0) return null;
  const pct = Math.round((completed / total) * 100);
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="mt-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
          <div
            className="bg-blue-500 h-1.5 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
          {completed}/{total} subtasks
        </span>
      </div>
    </div>
  );
}

function TodoItem({
  todo,
  onToggle,
  onEdit,
  onDelete,
  onRefresh,
}: {
  todo: Todo;
  onToggle: (id: number, completed: boolean) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (id: number) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const subtasks = todo.subtasks;
  const completedCount = subtasks.filter(s => !!s.completed).length;

  async function handleAddSubtask() {
    if (!newSubtask.trim()) return;
    try {
      const res = await fetch(`/api/todos/${todo.id}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newSubtask.trim() }),
      });
      if (!res.ok) return;
      setNewSubtask('');
      onRefresh();
    } catch { /* silent */ }
  }

  async function handleToggleSubtask(subtaskId: number, completed: boolean) {
    try {
      await fetch(`/api/todos/${todo.id}/subtasks/${subtaskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
      onRefresh();
    } catch { /* silent */ }
  }

  async function handleDeleteSubtask(subtaskId: number) {
    try {
      await fetch(`/api/todos/${todo.id}/subtasks/${subtaskId}`, { method: 'DELETE' });
      onRefresh();
    } catch { /* silent */ }
  }

  return (
    <div
      data-testid="todo-item"
      className={`flex flex-col p-3 rounded-lg border transition-all ${
        todo.completed
          ? 'opacity-60 bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="flex items-start gap-3">
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
            <ReminderBadge minutes={todo.reminder_minutes} />
          </div>
          {todo.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {todo.tags.map(tag => <TagPill key={tag.id} tag={tag} />)}
            </div>
          )}
          <ProgressBar completed={completedCount} total={subtasks.length} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {expanded ? '\u25BC Subtasks' : '\u25BA Subtasks'}
          </button>
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

      {expanded && (
        <div className="mt-2 ml-7 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
          {subtasks.map(s => (
            <div key={s.id} className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                checked={!!s.completed}
                onChange={() => handleToggleSubtask(s.id, !s.completed)}
                className="w-3.5 h-3.5 accent-blue-500"
              />
              <span className={`flex-1 text-sm ${s.completed ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                {s.title}
              </span>
              <button
                onClick={() => handleDeleteSubtask(s.id)}
                className="text-gray-400 hover:text-red-500 text-xs px-1"
              >
                \u2715
              </button>
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={newSubtask}
              onChange={e => setNewSubtask(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddSubtask()}
              placeholder="Add subtask\u2026"
              className="flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleAddSubtask}
              className="text-sm bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  todos,
  onToggle,
  onEdit,
  onDelete,
  onRefresh,
  variant = 'default',
  testId,
}: {
  title: string;
  todos: Todo[];
  onToggle: (id: number, completed: boolean) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (id: number) => void;
  onRefresh: () => void;
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
            onRefresh={onRefresh}
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

  // Filters (unified)
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Edit modal
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editState, setEditState] = useState<EditState>({
    title: '', priority: 'medium', due_date: '', is_recurring: false, recurrence_pattern: 'weekly', reminder_minutes: null,
  });
  const [editTagIds, setEditTagIds] = useState<number[]>([]);
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);

  // Tags
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTagIds, setNewTagIds] = useState<number[]>([]);
  const [newReminderMinutes, setNewReminderMinutes] = useState<number | null>(null);
  const [showTagModal, setShowTagModal] = useState(false);
  const [editTagId, setEditTagId] = useState<number | null>(null);
  const [editTagName, setEditTagName] = useState('');
  const [editTagColor, setEditTagColor] = useState('#3B82F6');
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B82F6');
  const [tagError, setTagError] = useState('');

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateCategory, setTemplateCategory] = useState('');

  // Import/Export
  const [importSuccess, setImportSuccess] = useState('');
  const [importError, setImportError] = useState('');

  // Notifications
  const { enabled: notifEnabled, requestPermission } = useNotifications();

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

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags');
      if (!res.ok) return;
      setTags(await res.json());
    } catch { /* silent */ }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates');
      if (!res.ok) return;
      setTemplates(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchTodos(); fetchTags(); fetchTemplates(); }, [fetchTodos, fetchTags, fetchTemplates]);

  // Load filter presets from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('todo-filter-presets');
      if (stored) setPresets(JSON.parse(stored));
    } catch { /* silent */ }
  }, []);

  // Notification polling
  useEffect(() => {
    if (!notifEnabled) return;
    const id = setInterval(async () => {
      if (Notification.permission !== 'granted') return;
      try {
        const res = await fetch('/api/notifications/check');
        if (!res.ok) return;
        const reminders: { id: number; title: string; due_date: string }[] = await res.json();
        for (const r of reminders) {
          new Notification(`\u23F0 ${r.title}`, {
            body: `Due at ${formatSingaporeDate(r.due_date)}`,
            icon: '/favicon.ico',
          });
        }
      } catch { /* silent */ }
    }, 60000);
    return () => clearInterval(id);
  }, [notifEnabled]);

  // ── Categorise todos ────────────────────────────────────────────────────────
  const filteredTodos = applyFilters(todos, filters);
  const hasActiveFilters = filters.search !== '' || filters.priority !== 'all' || filters.tagId !== null || filters.completion !== 'all' || filters.dateFrom !== '' || filters.dateTo !== '';
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
          reminder_minutes: newReminderMinutes,
          tagIds: newTagIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to add');
      setTodos(prev => [...prev, data]);
      setNewTitle(''); setNewDueDate(''); setNewRecurring(false); setNewReminderMinutes(null); setNewTagIds([]);
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
      reminder_minutes: todo.reminder_minutes,
    });
    setEditTagIds(todo.tags.map(t => t.id));
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
          reminder_minutes: editState.reminder_minutes,
          tagIds: editTagIds,
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

  // ── Tag handlers ────────────────────────────────────────────────────────────
  async function handleCreateTag() {
    if (!newTagName.trim()) { setTagError('Tag name is required'); return; }
    setTagError('');
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });
      const data = await res.json();
      if (!res.ok) { setTagError(data.error ?? 'Failed to create tag'); return; }
      setTags(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTagName(''); setNewTagColor('#3B82F6');
    } catch {
      setTagError('Failed to create tag');
    }
  }

  async function handleUpdateTag(id: number) {
    if (!editTagName.trim()) { setTagError('Tag name is required'); return; }
    setTagError('');
    try {
      const res = await fetch(`/api/tags/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editTagName.trim(), color: editTagColor }),
      });
      const data = await res.json();
      if (!res.ok) { setTagError(data.error ?? 'Failed to update tag'); return; }
      setTags(prev => prev.map(t => t.id === id ? data : t).sort((a, b) => a.name.localeCompare(b.name)));
      setEditTagId(null);
      fetchTodos();
    } catch {
      setTagError('Failed to update tag');
    }
  }

  async function handleDeleteTag(id: number) {
    try {
      const res = await fetch(`/api/tags/${id}`, { method: 'DELETE' });
      if (!res.ok) return;
      setTags(prev => prev.filter(t => t.id !== id));
      if (filters.tagId === id) setFilters(f => ({ ...f, tagId: null }));
      fetchTodos();
    } catch { /* silent */ }
  }

  async function handleEnableNotifications() {
    if (!notifEnabled) await requestPermission();
  }

  // ── Template handlers ─────────────────────────────────────────────────────────
  async function handleSaveTemplate() {
    if (!templateName.trim()) return;
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName.trim(),
          description: templateDescription.trim() || null,
          category: templateCategory.trim() || null,
          titleTemplate: newTitle.trim(),
          priority: newPriority,
          isRecurring: newRecurring,
          recurrencePattern: newRecurring ? newPattern : null,
          reminderMinutes: newReminderMinutes,
        }),
      });
      if (!res.ok) return;
      const tmpl = await res.json();
      setTemplates(prev => [...prev, tmpl].sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name)));
      setSaveTemplateOpen(false);
      setTemplateName(''); setTemplateDescription(''); setTemplateCategory('');
    } catch { /* silent */ }
  }

  async function handleUseTemplate(id: number) {
    try {
      const res = await fetch(`/api/templates/${id}/use`, { method: 'POST' });
      if (!res.ok) return;
      await fetchTodos();
    } catch { /* silent */ }
  }

  async function handleDeleteTemplate(id: number) {
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      if (!res.ok) return;
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch { /* silent */ }
  }

  // ── Export / Import ───────────────────────────────────────────────────────────
  function handleExportJSON() {
    const a = document.createElement('a');
    a.href = '/api/todos/export?format=json';
    a.download = `todos-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  function handleExportCSV() {
    const a = document.createElement('a');
    a.href = '/api/todos/export?format=csv';
    a.download = `todos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportSuccess(''); setImportError('');
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch('/api/todos/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setImportSuccess(result.message);
      await fetchTodos();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      e.target.value = '';
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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">&#x1F4DD; My Todos</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleEnableNotifications}
              className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                notifEnabled
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                  : 'bg-orange-500 hover:bg-orange-600 text-white'
              }`}
            >
              {notifEnabled ? '\uD83D\uDD14 Notifications On' : '\uD83D\uDD14 Enable Notifications'}
            </button>
            <button
              onClick={() => { setShowTagModal(true); setTagError(''); }}
              className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              &#x1F3F7;&#xFE0F; Manage Tags
            </button>
            <button
              onClick={() => setShowTemplateModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              &#x1F4CB; Templates
            </button>
            <button onClick={handleExportJSON} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-2 py-1.5 rounded-lg transition-colors">Export JSON</button>
            <button onClick={handleExportCSV} className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-2 py-1.5 rounded-lg transition-colors">Export CSV</button>
            <label className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-2 py-1.5 rounded-lg transition-colors cursor-pointer">
              Import
              <input type="file" accept=".json" className="hidden" onChange={handleImport} />
            </label>
            <button
              onClick={() => router.push('/calendar')}
              className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              &#x1F4C5; Calendar
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}
        {importSuccess && (
          <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-4 py-2 rounded-lg text-sm">
            {importSuccess}
          </div>
        )}
        {importError && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg text-sm">
            {importError}
          </div>
        )}

        {/* Add Todo Form */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 space-y-3">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Add Todo</h2>

          {templates.length > 0 && (
            <select
              defaultValue=""
              onChange={async e => { if (e.target.value) { await handleUseTemplate(Number(e.target.value)); e.target.value = ''; } }}
              className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">&#x1F4CB; Use a template…</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.category ? `[${t.category}] ` : ''}{t.name}</option>
              ))}
            </select>
          )}

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
              &#x1F504; Repeat
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
              <p className="text-amber-600 dark:text-amber-400 text-xs">&#x26A0;&#xFE0F; Recurring todos need a due date</p>
            )}
          </div>

          {/* Reminder */}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm text-gray-700 dark:text-gray-300 shrink-0">&#x1F514; Reminder:</label>
            <select
              data-testid="reminder-select"
              value={newReminderMinutes ?? ''}
              onChange={e => setNewReminderMinutes(e.target.value ? Number(e.target.value) : null)}
              disabled={!newDueDate}
              className="flex-1 min-w-36 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {REMINDER_OPTIONS.map(opt => (
                <option key={opt.value ?? 'none'} value={opt.value ?? ''}>{opt.label}</option>
              ))}
            </select>
            {!newDueDate && <p className="text-xs text-gray-400">Set a due date to enable reminders</p>}
          </div>

          {/* Tag selector */}
          {tags.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">&#x1F3F7;&#xFE0F; Tags:</p>
              <TagSelector
                allTags={tags}
                selectedIds={newTagIds}
                onToggle={id => setNewTagIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])}
              />
            </div>
          )}

          {addError && <p className="text-red-600 dark:text-red-400 text-xs">{addError}</p>}

          <div className="flex items-center gap-3">
            <button
              onClick={handleAdd}
              disabled={adding}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors text-sm"
            >
              {adding ? 'Adding…' : '+ Add'}
            </button>
            {newTitle.trim() && (
              <button
                type="button"
                onClick={() => setSaveTemplateOpen(true)}
                className="text-sm text-purple-600 dark:text-purple-400 hover:underline whitespace-nowrap"
              >
                &#x1F4BE; Save as Template
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">&#x1F50D;</span>
          <input
            type="text"
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            placeholder="Search todos and subtasks…"
            className="w-full pl-9 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {filters.search && (
            <button
              onClick={() => setFilters(f => ({ ...f, search: '' }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >&#x2715;</button>
          )}
        </div>

        {/* Quick Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <select
            data-testid="priority-filter"
            value={filters.priority}
            onChange={e => setFilters(f => ({ ...f, priority: e.target.value as Priority | 'all' }))}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
          {tags.length > 0 && (
            <select
              data-testid="tag-filter"
              value={filters.tagId ?? ''}
              onChange={e => setFilters(f => ({ ...f, tagId: e.target.value ? Number(e.target.value) : null }))}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Tags</option>
              {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
            </select>
          )}
          <button
            onClick={() => setAdvancedOpen(o => !o)}
            className={`text-sm px-3 py-1.5 rounded-lg ${
              advancedOpen ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            {advancedOpen ? '\u25BC Advanced' : '\u25BA Advanced'}
          </button>
          {hasActiveFilters && (
            <>
              <button onClick={() => setFilters(DEFAULT_FILTERS)} className="text-sm text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20">Clear All</button>
              <button onClick={() => setSavePresetOpen(true)} className="text-sm text-green-600 dark:text-green-400 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20">&#x1F4BE; Save Filter</button>
            </>
          )}
        </div>

        {/* Advanced Filters */}
        {advancedOpen && (
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Status</label>
                <select
                  value={filters.completion}
                  onChange={e => setFilters(f => ({ ...f, completion: e.target.value as FilterState['completion'] }))}
                  className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All Todos</option>
                  <option value="incomplete">Incomplete Only</option>
                  <option value="completed">Completed Only</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Due Date From</label>
                <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Due Date To</label>
                <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
            {presets.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Saved Presets</p>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map(p => (
                    <div key={p.id} className="flex items-center gap-1">
                      <button onClick={() => setFilters(p.filters)} className="text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded hover:bg-gray-300 dark:hover:bg-gray-500">{p.name}</button>
                      <button onClick={() => { const u = presets.filter(x => x.id !== p.id); setPresets(u); localStorage.setItem('todo-filter-presets', JSON.stringify(u)); }} className="text-gray-400 hover:text-red-500 text-xs">&#x2715;</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Todo Sections */}
        <Section title="Overdue" todos={overdue} onToggle={handleToggle} onEdit={openEdit} onDelete={handleDelete} onRefresh={fetchTodos} variant="overdue" testId="overdue-section" />
        <Section title="Pending" todos={pending} onToggle={handleToggle} onEdit={openEdit} onDelete={handleDelete} onRefresh={fetchTodos} testId="pending-section" />
        <Section title="Completed" todos={completed} onToggle={handleToggle} onEdit={openEdit} onDelete={handleDelete} onRefresh={fetchTodos} testId="completed-section" />

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
                &#x1F504; Repeat
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

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">&#x1F514; Reminder</label>
              <select
                value={editState.reminder_minutes ?? ''}
                onChange={e => setEditState(s => ({ ...s, reminder_minutes: e.target.value ? Number(e.target.value) : null }))}
                disabled={!editState.due_date}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {REMINDER_OPTIONS.map(opt => (
                  <option key={opt.value ?? 'none'} value={opt.value ?? ''}>{opt.label}</option>
                ))}
              </select>
            </div>

            {tags.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">&#x1F3F7;&#xFE0F; Tags</label>
                <TagSelector
                  allTags={tags}
                  selectedIds={editTagIds}
                  onToggle={id => setEditTagIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])}
                />
              </div>
            )}

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

      {/* Tag Management Modal */}
      {showTagModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={e => { if (e.target === e.currentTarget) { setShowTagModal(false); setEditTagId(null); setTagError(''); } }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4 max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">🏷️ Manage Tags</h2>

            <div className="space-y-2">
              {tags.map(tag => (
                <div key={tag.id} className="flex items-center gap-2">
                  {editTagId === tag.id ? (
                    <>
                      <input
                        type="color"
                        value={editTagColor}
                        onChange={e => setEditTagColor(e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer border-0"
                      />
                      <input
                        type="text"
                        value={editTagName}
                        onChange={e => setEditTagName(e.target.value)}
                        className="flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button onClick={() => handleUpdateTag(tag.id)} className="text-xs text-green-600 hover:underline">Save</button>
                      <button onClick={() => setEditTagId(null)} className="text-xs text-gray-500 hover:underline">Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                      <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{tag.name}</span>
                      <button
                        onClick={() => { setEditTagId(tag.id); setEditTagName(tag.name); setEditTagColor(tag.color); setTagError(''); }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button onClick={() => handleDeleteTag(tag.id)} className="text-xs text-red-600 hover:underline">
                        Delete
                      </button>
                    </>
                  )}
                </div>
              ))}
              {tags.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">No tags yet.</p>
              )}
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Create New Tag</h3>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newTagColor}
                  onChange={e => setNewTagColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0"
                />
                <input
                  type="text"
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateTag()}
                  placeholder="Tag name"
                  className="flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button onClick={handleCreateTag} className="text-sm bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600">
                  Create
                </button>
              </div>
              {tagError && <p className="text-red-600 dark:text-red-400 text-xs">{tagError}</p>}
            </div>

            <button
              onClick={() => { setShowTagModal(false); setEditTagId(null); setTagError(''); }}
              className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium py-2 rounded-lg transition-colors text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Templates Modal */}
      {showTemplateModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={e => { if (e.target === e.currentTarget) setShowTemplateModal(false); }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-lg space-y-4 max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">📋 Templates</h2>
            {templates.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No templates yet. Fill in the form and click "💾 Save as Template".</p>
            ) : (
              <div className="space-y-3">
                {templates.map(t => (
                  <div key={t.id} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 dark:text-white text-sm">{t.name}</span>
                        {t.category && <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-2 py-0.5 rounded-full">{t.category}</span>}
                        <PriorityBadge priority={t.priority} />
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{t.title_template}</p>
                      {t.description && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t.description}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={async () => { await handleUseTemplate(t.id); setShowTemplateModal(false); }}
                        className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
                      >Use</button>
                      <button onClick={() => handleDeleteTemplate(t.id)} className="text-xs text-red-600 hover:underline">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowTemplateModal(false)}
              className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium py-2 rounded-lg transition-colors text-sm"
            >Close</button>
          </div>
        </div>
      )}

      {/* Save as Template Modal */}
      {saveTemplateOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">💾 Save as Template</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template Name *</label>
              <input type="text" value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="e.g., Weekly Review" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
              <input type="text" value={templateCategory} onChange={e => setTemplateCategory(e.target.value)} placeholder="e.g., Work, Personal" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <input type="text" value={templateDescription} onChange={e => setTemplateDescription(e.target.value)} placeholder="Optional description" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setSaveTemplateOpen(false); setTemplateName(''); setTemplateDescription(''); setTemplateCategory(''); }} className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={handleSaveTemplate} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 rounded-lg text-sm">Save Template</button>
            </div>
          </div>
        </div>
      )}

      {/* Save Filter Preset Modal */}
      {savePresetOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">💾 Save Filter Preset</h2>
            <input
              type="text"
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && presetName.trim()) { const n: FilterPreset = { id: Date.now().toString(), name: presetName.trim(), filters }; const u = [...presets, n]; setPresets(u); localStorage.setItem('todo-filter-presets', JSON.stringify(u)); setSavePresetOpen(false); setPresetName(''); } }}
              placeholder="Preset name…"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-3">
              <button onClick={() => { setSavePresetOpen(false); setPresetName(''); }} className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium py-2 rounded-lg text-sm">Cancel</button>
              <button
                onClick={() => { if (!presetName.trim()) return; const n: FilterPreset = { id: Date.now().toString(), name: presetName.trim(), filters }; const u = [...presets, n]; setPresets(u); localStorage.setItem('todo-filter-presets', JSON.stringify(u)); setSavePresetOpen(false); setPresetName(''); }}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg text-sm"
              >Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
