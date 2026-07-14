'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Priority, RecurrencePattern, ReminderMinutes, Subtask, Tag, Template, Todo } from '@/lib/db';
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
import { useDebounce } from '@/lib/hooks/useDebounce';
import {
  DEFAULT_FILTER_STATE,
  FilterPreset,
  FilterState,
  applyFilters,
  deletePreset,
  hasActiveFilters,
  loadPresets,
  savePreset,
} from '@/lib/filters';

type PriorityFilter = Priority | 'all';

type TagDraft = { name: string; color: string };

type TemplateDraft = {
  name: string;
  description: string;
  category: string;
  subtasks: string[]; // titles of subtasks to capture
};

const EMPTY_TEMPLATE_DRAFT: TemplateDraft = { name: '', description: '', category: '', subtasks: [] };

type TodoDraft = {
  title: string;
  priority: Priority;
  dueDate: string;
  isRecurring: boolean;
  recurrencePattern: RecurrencePattern;
  reminderMinutes: ReminderMinutes | null;
  tagIds: number[];
};

type EditDraft = {
  title: string;
  priority: Priority;
  dueDate: string;
  completed: boolean;
  isRecurring: boolean;
  recurrencePattern: RecurrencePattern;
  reminderMinutes: ReminderMinutes | null;
  tagIds: number[];
};

const EMPTY_DRAFT: TodoDraft = {
  title: '',
  priority: 'medium',
  dueDate: '',
  isRecurring: false,
  recurrencePattern: 'weekly',
  reminderMinutes: null,
  tagIds: [],
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
    subtasks: [],
    tags: [],
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

function TagPill({ tag, onClick }: { tag: Tag; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ borderColor: tag.color, backgroundColor: `${tag.color}22`, color: tag.color }}
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition hover:opacity-80"
      title={onClick ? `Filter by ${tag.name}` : tag.name}
    >
      {tag.name}
    </button>
  );
}

function ProgressBar({ subtasks }: { subtasks: Subtask[] }) {
  if (subtasks.length === 0) return null;
  const done = subtasks.filter((s) => s.completed).length;
  const pct = Math.round((done / subtasks.length) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {done}/{subtasks.length}
      </span>
    </div>
  );
}

function SubtaskRow({
  subtask,
  onToggle,
  onDelete,
}: {
  subtask: Subtask;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
      <input
        type="checkbox"
        checked={subtask.completed}
        onChange={onToggle}
        className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
      />
      <span className={`flex-1 text-sm ${subtask.completed ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}`}>
        {subtask.title}
      </span>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete subtask"
        className="text-slate-400 hover:text-red-500"
      >
        ✕
      </button>
    </div>
  );
}

function TodoCard({
  todo,
  onToggle,
  onEdit,
  onDelete,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onTagClick,
}: {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  onAddSubtask: (todoId: number, title: string) => Promise<void>;
  onToggleSubtask: (subtask: Subtask, todo: Todo) => Promise<void>;
  onDeleteSubtask: (subtask: Subtask, todo: Todo) => Promise<void>;
  onTagClick: (tagId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [subtaskInput, setSubtaskInput] = useState('');
  const [subtaskAdding, setSubtaskAdding] = useState(false);
  const subtasks = todo.subtasks ?? [];
  const tags = todo.tags ?? [];

  async function handleAddSubtask(e: FormEvent) {
    e.preventDefault();
    const title = subtaskInput.trim();
    if (!title) return;
    setSubtaskAdding(true);
    await onAddSubtask(todo.id, title);
    setSubtaskInput('');
    setSubtaskAdding(false);
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50/75 p-4 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <input
            type="checkbox"
            checked={todo.completed}
            onChange={() => onToggle(todo)}
            aria-label={`${todo.completed ? 'Mark' : 'Complete'} ${todo.title}`}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <div className="space-y-1.5 min-w-0 flex-1">
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
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <TagPill key={tag.id} tag={tag} onClick={() => onTagClick(tag.id)} />
                ))}
              </div>
            )}
            {subtasks.length > 0 && <ProgressBar subtasks={subtasks} />}
          </div>
        </div>

        <div className="flex gap-2 self-start shrink-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {expanded ? '▼' : '▶'} Subtasks{subtasks.length > 0 ? ` (${subtasks.length})` : ''}
          </button>
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

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          {subtasks.map((st) => (
            <SubtaskRow
              key={st.id}
              subtask={st}
              onToggle={() => void onToggleSubtask(st, todo)}
              onDelete={() => void onDeleteSubtask(st, todo)}
            />
          ))}
          <form onSubmit={(e) => void handleAddSubtask(e)} className="flex gap-2">
            <input
              value={subtaskInput}
              onChange={(e) => setSubtaskInput(e.target.value)}
              placeholder="Add subtask…"
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={subtaskAdding || !subtaskInput.trim()}
              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Add
            </button>
          </form>
        </div>
      )}
    </article>
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
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onTagClick,
}: {
  title: string;
  count: number;
  tone: string;
  todos: Todo[];
  onToggle: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  onAddSubtask: (todoId: number, title: string) => Promise<void>;
  onToggleSubtask: (subtask: Subtask, todo: Todo) => Promise<void>;
  onDeleteSubtask: (subtask: Subtask, todo: Todo) => Promise<void>;
  onTagClick: (tagId: number) => void;
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
            <TodoCard
              key={todo.id}
              todo={todo}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddSubtask={onAddSubtask}
              onToggleSubtask={onToggleSubtask}
              onDeleteSubtask={onDeleteSubtask}
              onTagClick={onTagClick}
            />
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
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Tags
  const [tags, setTags] = useState<Tag[]>([]);
  const [showTagModal, setShowTagModal] = useState(false);
  const [tagDraft, setTagDraft] = useState<TagDraft>({ name: '', color: '#3B82F6' });
  const [tagDraftError, setTagDraftError] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [editTagDraft, setEditTagDraft] = useState<TagDraft>({ name: '', color: '#3B82F6' });
  const [editTagError, setEditTagError] = useState<string | null>(null);

  // Filter presets
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(EMPTY_TEMPLATE_DRAFT);
  const [templateDraftError, setTemplateDraftError] = useState<string | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);

  // Export / import
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [importing, setImporting] = useState(false);

  const debouncedSearch = useDebounce(filters.search, 300);
  const effectiveFilters: FilterState = { ...filters, search: debouncedSearch };

  const { permission: notificationPermission, requestPermission } = useNotifications();

  // Load presets from localStorage on mount
  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  const loadTags = useCallback(async () => {
    const res = await fetch('/api/tags');
    if (res.ok) {
      const data = await res.json() as Tag[];
      setTags(data);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    const res = await fetch('/api/templates');
    if (res.ok) {
      const data = await res.json() as Template[];
      setTemplates(data);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadTodos() {
      setLoading(true);
      setError(null);

      const [todosRes] = await Promise.all([fetch('/api/todos'), loadTags(), loadTemplates()]);
      if (!active) return;

      if (!todosRes.ok) {
        setError('Unable to load todos right now.');
        setLoading(false);
        return;
      }

      const data = (await todosRes.json()) as Todo[];
      setTodos(data);
      setLoading(false);
    }

    void loadTodos();

    return () => {
      active = false;
    };
  }, [loadTags, loadTemplates]);

  const visibleTodos = applyFilters(todos, effectiveFilters);
  const sections = sectionTodos(visibleTodos, new Date());
  const filtersActive = hasActiveFilters(filters);

  // ── Tag management ───────────────────────────────────────────────────────

  async function handleCreateTag(e: FormEvent) {
    e.preventDefault();
    setTagDraftError(null);
    const name = tagDraft.name.trim();
    if (!name) { setTagDraftError('Name is required.'); return; }
    const res = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color: tagDraft.color }),
    });
    const payload = await res.json() as Tag | { error?: string };
    if (!res.ok) { setTagDraftError((payload as { error?: string }).error ?? 'Failed to create tag.'); return; }
    setTags((prev) => [...prev, payload as Tag].sort((a, b) => a.name.localeCompare(b.name)));
    setTagDraft({ name: '', color: '#3B82F6' });
  }

  async function handleUpdateTag(e: FormEvent) {
    e.preventDefault();
    if (!editingTag) return;
    setEditTagError(null);
    const name = editTagDraft.name.trim();
    if (!name) { setEditTagError('Name is required.'); return; }
    const res = await fetch(`/api/tags/${editingTag.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color: editTagDraft.color }),
    });
    const payload = await res.json() as Tag | { error?: string };
    if (!res.ok) { setEditTagError((payload as { error?: string }).error ?? 'Failed to update tag.'); return; }
    const updated = payload as Tag;
    setTags((prev) => prev.map((t) => t.id === updated.id ? updated : t).sort((a, b) => a.name.localeCompare(b.name)));
    // Refresh todos so tag names/colors update on cards
    setTodos((prev) => prev.map((todo) => ({
      ...todo,
      tags: (todo.tags ?? []).map((t) => t.id === updated.id ? updated : t),
    })));
    setEditingTag(null);
  }

  async function handleDeleteTag(tag: Tag) {
    if (!confirm(`Delete tag "${tag.name}"? It will be removed from all todos.`)) return;
    await fetch(`/api/tags/${tag.id}`, { method: 'DELETE' });
    setTags((prev) => prev.filter((t) => t.id !== tag.id));
    setTodos((prev) => prev.map((todo) => ({
      ...todo,
      tags: (todo.tags ?? []).filter((t) => t.id !== tag.id),
    })));
    if (filters.tagId === tag.id) setFilters((f) => ({ ...f, tagId: 'all' }));
  }

  // ── Template management ──────────────────────────────────────────────────

  async function handleSaveTemplate(e: FormEvent) {
    e.preventDefault();
    setTemplateDraftError(null);
    const name = templateDraft.name.trim();
    if (!name) { setTemplateDraftError('Template name is required.'); return; }
    if (!draft.title.trim()) { setTemplateDraftError('Todo title is required.'); return; }
    setTemplateSaving(true);
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: templateDraft.description || undefined,
        category: templateDraft.category || undefined,
        title_template: draft.title.trim(),
        priority: draft.priority,
        is_recurring: draft.isRecurring,
        recurrence_pattern: draft.isRecurring ? draft.recurrencePattern : undefined,
        reminder_minutes: draft.reminderMinutes ?? undefined,
        subtasks: templateDraft.subtasks.filter((t) => t.trim()).map((t, i) => ({ title: t.trim(), position: i })),
      }),
    });
    setTemplateSaving(false);
    if (!res.ok) {
      const payload = await res.json() as { error?: string };
      setTemplateDraftError(payload.error ?? 'Failed to save template.');
      return;
    }
    const saved = await res.json() as Template;
    setTemplates((prev) => [saved, ...prev]);
    setShowSaveTemplateModal(false);
    setTemplateDraft(EMPTY_TEMPLATE_DRAFT);
  }

  async function handleUseTemplate(templateId: number) {
    const res = await fetch(`/api/templates/${templateId}/use`, { method: 'POST' });
    if (!res.ok) return;
    const created = await res.json() as Todo;
    setTodos((prev) => [...prev, created]);
    setShowTemplateManager(false);
  }

  async function handleDeleteTemplate(templateId: number) {
    if (!confirm('Delete this template? Todos created from it are not affected.')) return;
    await fetch(`/api/templates/${templateId}`, { method: 'DELETE' });
    setTemplates((prev) => prev.filter((t) => t.id !== templateId));
  }

  // ── Export / Import ──────────────────────────────────────────────────────

  function handleExport(format: 'json' | 'csv') {
    window.location.href = `/api/todos/export?format=${format}`;
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMessage(null);
    try {
      const text = await file.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        setImportMessage({ type: 'error', text: 'Invalid JSON format' });
        return;
      }
      const res = await fetch('/api/todos/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { imported?: number; error?: string };
      if (!res.ok) {
        setImportMessage({ type: 'error', text: data.error ?? 'Failed to import todos' });
        return;
      }
      setImportMessage({ type: 'success', text: `Successfully imported ${data.imported ?? 0} todos` });
      // Reload todos after import
      const todosRes = await fetch('/api/todos');
      if (todosRes.ok) setTodos(await todosRes.json() as Todo[]);
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  }

  // ── Subtask management ───────────────────────────────────────────────────
  async function handleAddSubtask(todoId: number, title: string): Promise<void> {
    const res = await fetch(`/api/todos/${todoId}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return;
    const subtask = await res.json() as Subtask;
    setTodos((prev) => prev.map((t) =>
      t.id === todoId ? { ...t, subtasks: [...(t.subtasks ?? []), subtask] } : t,
    ));
  }

  async function handleToggleSubtask(subtask: Subtask, todo: Todo): Promise<void> {
    const res = await fetch(`/api/subtasks/${subtask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !subtask.completed }),
    });
    if (!res.ok) return;
    const updated = await res.json() as Subtask;
    setTodos((prev) => prev.map((t) =>
      t.id === todo.id
        ? { ...t, subtasks: (t.subtasks ?? []).map((s) => s.id === updated.id ? updated : s) }
        : t,
    ));
  }

  async function handleDeleteSubtask(subtask: Subtask, todo: Todo): Promise<void> {
    const res = await fetch(`/api/subtasks/${subtask.id}`, { method: 'DELETE' });
    if (!res.ok) return;
    setTodos((prev) => prev.map((t) =>
      t.id === todo.id
        ? { ...t, subtasks: (t.subtasks ?? []).filter((s) => s.id !== subtask.id) }
        : t,
    ));
  }

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

      // Attach selected tags
      await Promise.all(
        draft.tagIds.map((tagId) =>
          fetch(`/api/todos/${created.id}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag_id: tagId }),
          }),
        ),
      );
      const selectedTags = tags.filter((t) => draft.tagIds.includes(t.id));
      const createdWithTags: Todo = { ...created, subtasks: [], tags: selectedTags };

      setTodos((current) => sortTodos(current.map((todo) => (todo.id === optimisticTodo.id ? createdWithTags : todo))));
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
      tagIds: (todo.tags ?? []).map((t) => t.id),
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

      // Sync tags: detach removed, attach added
      const prevTagIds = (editingTodo.tags ?? []).map((t) => t.id);
      const newTagIds = editDraft.tagIds;
      const toDetach = prevTagIds.filter((id) => !newTagIds.includes(id));
      const toAttach = newTagIds.filter((id) => !prevTagIds.includes(id));

      await Promise.all([
        ...toDetach.map((tagId) =>
          fetch(`/api/todos/${editingTodo.id}/tags`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag_id: tagId }),
          }),
        ),
        ...toAttach.map((tagId) =>
          fetch(`/api/todos/${editingTodo.id}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag_id: tagId }),
          }),
        ),
      ]);

      const updatedTags = tags.filter((t) => newTagIds.includes(t.id));
      const finalTodo: Todo = {
        ...updatedTodo,
        subtasks: editingTodo.subtasks ?? [],
        tags: updatedTags,
      };

      setTodos((current) => sortTodos(updateTodoList(current, finalTodo)));
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

            <div className="flex items-center gap-3 flex-wrap">
              <Link
                href="/calendar"
                className="rounded-xl border border-purple-300 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition hover:bg-purple-100 dark:border-purple-700 dark:bg-purple-950/40 dark:text-purple-300 dark:hover:bg-purple-950/60"
              >
                📅 Calendar
              </Link>
              <button
                type="button"
                onClick={() => setShowTemplateManager(true)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                📋 Templates
              </button>
              <button
                type="button"
                onClick={() => setShowTagModal(true)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                🏷️ Manage Tags
              </button>
              {/* Export / Import */}
              <button
                type="button"
                onClick={() => handleExport('json')}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              >
                ↓ JSON
              </button>
              <button
                type="button"
                onClick={() => handleExport('csv')}
                className="rounded-xl border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-700 transition hover:bg-teal-100 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300"
              >
                ↓ CSV
              </button>
              <button
                type="button"
                onClick={() => importFileRef.current?.click()}
                disabled={importing}
                className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100 disabled:opacity-50 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
              >
                {importing ? 'Importing…' : '↑ Import'}
              </button>
              <input
                ref={importFileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => void handleImportFile(e)}
              />
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
          {importMessage && (
            <p
              role="alert"
              className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                importMessage.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
              }`}
            >
              {importMessage.text}
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

            {tags.length > 0 && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Tags</label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => {
                    const selected = draft.tagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => setDraft((d) => ({
                          ...d,
                          tagIds: selected ? d.tagIds.filter((id) => id !== tag.id) : [...d.tagIds, tag.id],
                        }))}
                        style={selected ? { backgroundColor: tag.color, borderColor: tag.color, color: '#fff' } : { borderColor: tag.color, color: tag.color }}
                        className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition"
                      >
                        {selected && '✓ '}{tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                {saving ? 'Adding…' : 'Add Todo'}
              </button>
              {draft.title.trim() && (
                <button
                  type="button"
                  onClick={() => { setTemplateDraft(EMPTY_TEMPLATE_DRAFT); setTemplateDraftError(null); setShowSaveTemplateModal(true); }}
                  className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  💾 Save as Template
                </button>
              )}
            </div>

            {templates.length > 0 && (
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Use Template</label>
                <select
                  defaultValue=""
                  onChange={async (e) => {
                    const id = Number(e.target.value);
                    if (!id) return;
                    e.target.value = '';
                    await handleUseTemplate(id);
                  }}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-950/60"
                >
                  <option value="">Pick a template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.category ? ` (${t.category})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </form>

          <div className="space-y-3 rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            {/* Search */}
            <div>
              <label htmlFor="todo-search" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Search
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">🔍</span>
                <input
                  id="todo-search"
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                  placeholder="Search todos and subtasks..."
                  className="w-full pl-9 pr-9 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-950/60"
                />
                {filters.search && (
                  <button
                    type="button"
                    onClick={() => setFilters((f) => ({ ...f, search: '' }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Quick filters: priority + tag */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="priority-filter" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  Priority
                </label>
                <select
                  id="priority-filter"
                  value={filters.priority}
                  onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value as FilterState['priority'] }))}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-950/60"
                >
                  {PRIORITY_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              {tags.length > 0 && (
                <div>
                  <label htmlFor="tag-filter" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                    Tag
                  </label>
                  <select
                    id="tag-filter"
                    value={filters.tagId}
                    onChange={(e) => setFilters((f) => ({ ...f, tagId: e.target.value === 'all' ? 'all' : Number(e.target.value) }))}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-950/60"
                  >
                    <option value="all">All Tags</option>
                    {tags.map((tag) => (
                      <option key={tag.id} value={tag.id}>{tag.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Advanced toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${advancedOpen ? 'bg-blue-500 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}
              >
                {advancedOpen ? '▼ Advanced' : '▶ Advanced'}
              </button>
              {filtersActive && (
                <>
                  <button
                    type="button"
                    onClick={() => { setFilters(DEFAULT_FILTER_STATE); setAdvancedOpen(false); }}
                    className="rounded-xl border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                  >
                    Clear All
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPresetName(''); setShowSavePresetModal(true); }}
                    className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                  >
                    💾 Save Filter
                  </button>
                </>
              )}
            </div>

            {/* Advanced panel */}
            {advancedOpen && (
              <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                <div>
                  <label htmlFor="completion-filter" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                    Completion Status
                  </label>
                  <select
                    id="completion-filter"
                    value={filters.completion}
                    onChange={(e) => setFilters((f) => ({ ...f, completion: e.target.value as FilterState['completion'] }))}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="all">All Todos</option>
                    <option value="incomplete">Incomplete Only</option>
                    <option value="completed">Completed Only</option>
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="due-from" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                      Due Date From
                    </label>
                    <input
                      id="due-from"
                      type="date"
                      value={filters.dueDateFrom ?? ''}
                      onChange={(e) => setFilters((f) => ({ ...f, dueDateFrom: e.target.value || null }))}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="due-to" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                      Due Date To
                    </label>
                    <input
                      id="due-to"
                      type="date"
                      value={filters.dueDateTo ?? ''}
                      onChange={(e) => setFilters((f) => ({ ...f, dueDateTo: e.target.value || null }))}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Saved presets */}
                {presets.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Saved filters</p>
                    <div className="flex flex-wrap gap-2">
                      {presets.map((preset) => (
                        <div key={preset.id} className="flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs dark:border-slate-700 dark:bg-slate-800">
                          <button
                            type="button"
                            onClick={() => setFilters(preset.filters)}
                            className="font-medium text-slate-700 hover:text-blue-600 dark:text-slate-200"
                          >
                            {preset.name}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Delete preset "${preset.name}"?`)) {
                                setPresets(deletePreset(preset.id));
                              }
                            }}
                            className="text-slate-400 hover:text-red-500"
                            aria-label="Delete preset"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

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
              onAddSubtask={handleAddSubtask}
              onToggleSubtask={handleToggleSubtask}
              onDeleteSubtask={handleDeleteSubtask}
              onTagClick={(tagId) => setFilters((f) => ({ ...f, tagId }))}
            />
            <SectionCard
              title={sectionTitles.pending}
              count={sections.pending.length}
              tone="text-slate-700 dark:text-slate-200"
              todos={sections.pending}
              onToggle={handleToggle}
              onEdit={openEdit}
              onDelete={handleDelete}
              onAddSubtask={handleAddSubtask}
              onToggleSubtask={handleToggleSubtask}
              onDeleteSubtask={handleDeleteSubtask}
              onTagClick={(tagId) => setFilters((f) => ({ ...f, tagId }))}
            />
            <SectionCard
              title={sectionTitles.completed}
              count={sections.completed.length}
              tone="text-emerald-600 dark:text-emerald-300"
              todos={sections.completed}
              onToggle={handleToggle}
              onEdit={openEdit}
              onDelete={handleDelete}
              onAddSubtask={handleAddSubtask}
              onToggleSubtask={handleToggleSubtask}
              onDeleteSubtask={handleDeleteSubtask}
              onTagClick={(tagId) => setFilters((f) => ({ ...f, tagId }))}
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

              {tags.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Tags</label>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => {
                      const selected = editDraft.tagIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => setEditDraft((d) => d ? {
                            ...d,
                            tagIds: selected ? d.tagIds.filter((id) => id !== tag.id) : [...d.tagIds, tag.id],
                          } : d)}
                          style={selected ? { backgroundColor: tag.color, borderColor: tag.color, color: '#fff' } : { borderColor: tag.color, color: tag.color }}
                          className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition"
                        >
                          {selected && '✓ '}{tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

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

      {/* ── Manage Tags Modal ─────────────────────────────────────────────── */}
      {showTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Tags</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">Manage Tags</h2>
              </div>
              <button
                type="button"
                onClick={() => { setShowTagModal(false); setEditingTag(null); setTagDraftError(null); setEditTagError(null); }}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            {/* Existing tags */}
            <div className="mb-5 space-y-2 max-h-64 overflow-y-auto">
              {tags.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No tags yet.</p>
              ) : (
                tags.map((tag) => (
                  <div key={tag.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
                    {editingTag?.id === tag.id ? (
                      <form onSubmit={(e) => void handleUpdateTag(e)} className="flex flex-1 items-center gap-2">
                        <input
                          value={editTagDraft.name}
                          onChange={(e) => setEditTagDraft((d) => ({ ...d, name: e.target.value }))}
                          className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          autoFocus
                        />
                        <input
                          type="color"
                          value={editTagDraft.color}
                          onChange={(e) => setEditTagDraft((d) => ({ ...d, color: e.target.value }))}
                          className="h-8 w-8 cursor-pointer rounded border border-slate-300"
                        />
                        <button type="submit" className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700">Save</button>
                        <button type="button" onClick={() => setEditingTag(null)} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100">Cancel</button>
                      </form>
                    ) : (
                      <>
                        <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                        <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">{tag.name}</span>
                        <button
                          type="button"
                          onClick={() => { setEditingTag(tag); setEditTagDraft({ name: tag.name, color: tag.color }); setEditTagError(null); }}
                          className="rounded-xl border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteTag(tag)}
                          className="rounded-xl border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                ))
              )}
              {editTagError && <p className="text-xs text-red-600 dark:text-red-400">{editTagError}</p>}
            </div>

            {/* Create tag form */}
            <form onSubmit={(e) => void handleCreateTag(e)} className="space-y-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Add new tag</p>
              {tagDraftError && <p className="text-xs text-red-600 dark:text-red-400">{tagDraftError}</p>}
              <div className="flex gap-2">
                <input
                  value={tagDraft.name}
                  onChange={(e) => setTagDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Tag name"
                  className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <input
                  type="color"
                  value={tagDraft.color}
                  onChange={(e) => setTagDraft((d) => ({ ...d, color: e.target.value }))}
                  className="h-12 w-12 cursor-pointer rounded-2xl border border-slate-300 p-1"
                />
                <button type="submit" className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-blue-500 dark:hover:bg-blue-400">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Save Preset Modal ─────────────────────────────────────────────── */}
      {showSavePresetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-5">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Filters</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">Save Filter</h2>
            </div>

            <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
              {filters.search.trim() && <p>Search: &quot;{filters.search.trim()}&quot;</p>}
              {filters.priority !== 'all' && <p>Priority: {filters.priority}</p>}
              {filters.tagId !== 'all' && <p>Tag: {tags.find((t) => t.id === filters.tagId)?.name ?? filters.tagId}</p>}
              {filters.completion !== 'all' && <p>Completion: {filters.completion}</p>}
              {filters.dueDateFrom && <p>From: {filters.dueDateFrom}</p>}
              {filters.dueDateTo && <p>To: {filters.dueDateTo}</p>}
            </div>

            <div className="flex gap-3">
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset name…"
                autoFocus
                className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <button
                type="button"
                disabled={!presetName.trim()}
                onClick={() => {
                  if (!presetName.trim()) return;
                  const preset: FilterPreset = {
                    id: crypto.randomUUID(),
                    name: presetName.trim(),
                    filters,
                    createdAt: new Date().toISOString(),
                  };
                  setPresets(savePreset(preset));
                  setShowSavePresetModal(false);
                  setPresetName('');
                }}
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setShowSavePresetModal(false)}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Save Template Modal ───────────────────────────────────────────── */}
      {showSaveTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Templates</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">Save as Template</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Capturing: &ldquo;<strong>{draft.title}</strong>&rdquo; · {draft.priority} priority
                  {draft.isRecurring && ` · repeats ${draft.recurrencePattern}`}
                  {draft.reminderMinutes && ` · reminder ${draft.reminderMinutes}m before`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSaveTemplateModal(false)}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                Cancel
              </button>
            </div>

            {templateDraftError && (
              <p className="mb-3 text-sm text-red-600 dark:text-red-400">{templateDraftError}</p>
            )}

            <form onSubmit={(e) => void handleSaveTemplate(e)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  Template name <span className="text-red-500">*</span>
                </label>
                <input
                  value={templateDraft.name}
                  onChange={(e) => setTemplateDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. Weekly Team Meeting"
                  autoFocus
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Description</label>
                  <input
                    value={templateDraft.description}
                    onChange={(e) => setTemplateDraft((d) => ({ ...d, description: e.target.value }))}
                    placeholder="Optional description"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Category</label>
                  <input
                    value={templateDraft.category}
                    onChange={(e) => setTemplateDraft((d) => ({ ...d, category: e.target.value }))}
                    placeholder="e.g. Work, Personal"
                    list="template-category-suggestions"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <datalist id="template-category-suggestions">
                    <option value="Work" />
                    <option value="Personal" />
                    <option value="Finance" />
                    <option value="Health" />
                    <option value="Education" />
                  </datalist>
                </div>
              </div>

              {/* Inline subtask capture */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  Subtasks to include (optional)
                </label>
                {templateDraft.subtasks.map((st, idx) => (
                  <div key={idx} className="mb-1.5 flex gap-2">
                    <input
                      value={st}
                      onChange={(e) => setTemplateDraft((d) => ({
                        ...d,
                        subtasks: d.subtasks.map((s, i) => i === idx ? e.target.value : s),
                      }))}
                      placeholder={`Subtask ${idx + 1}`}
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setTemplateDraft((d) => ({
                        ...d,
                        subtasks: d.subtasks.filter((_, i) => i !== idx),
                      }))}
                      className="text-slate-400 hover:text-red-500"
                    >✕</button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setTemplateDraft((d) => ({ ...d, subtasks: [...d.subtasks, ''] }))}
                  className="mt-1 rounded-xl border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400"
                >
                  + Add subtask
                </button>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSaveTemplateModal(false)}
                  className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={templateSaving || !templateDraft.name.trim()}
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  {templateSaving ? 'Saving…' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Template Manager Modal ────────────────────────────────────────── */}
      {showTemplateManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Templates</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">Template Manager</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowTemplateManager(false)}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            {templates.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No templates yet. Create a todo and click &ldquo;💾 Save as Template&rdquo;.
              </p>
            ) : (
              <div className="max-h-[60vh] space-y-3 overflow-y-auto">
                {templates.map((t) => {
                  let parsedSubtasks: Array<{ title: string }> = [];
                  if (t.subtasks_json) {
                    try { parsedSubtasks = JSON.parse(t.subtasks_json) as Array<{ title: string }>; } catch { /* ignore */ }
                  }
                  return (
                    <div key={t.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t.name}</strong>
                            {t.category && (
                              <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                {t.category}
                              </span>
                            )}
                          </div>
                          {t.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">{t.description}</p>
                          )}
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Title: &ldquo;{t.title_template}&rdquo;
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                              t.priority === 'high'
                                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
                                : t.priority === 'low'
                                  ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300'
                                  : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
                            }`}>
                              {t.priority}
                            </span>
                            {t.is_recurring && t.recurrence_pattern && (
                              <span className="inline-flex items-center rounded-full border border-purple-300 bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:border-purple-700 dark:bg-purple-950/40 dark:text-purple-200">
                                🔄 {t.recurrence_pattern}
                              </span>
                            )}
                            {t.reminder_minutes != null && (
                              <span className="inline-flex items-center rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200">
                                🔔 {t.reminder_minutes}m
                              </span>
                            )}
                            {parsedSubtasks.length > 0 && (
                              <span className="text-xs text-slate-400 dark:text-slate-500">
                                {parsedSubtasks.length} subtask{parsedSubtasks.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => void handleUseTemplate(t.id)}
                            className="rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                          >
                            Use
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteTemplate(t.id)}
                            className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
