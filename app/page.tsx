"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────

type Todo = {
  id: number;
  title: string;
  description: string | null;
  priority: "high" | "medium" | "low";
  recurrence_pattern: "daily" | "weekly" | "monthly" | "yearly" | null;
  due_date: string | null;
  completed: 0 | 1;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  updated_at: string;
};

type Subtask = {
  id: number;
  todo_id: number;
  title: string;
  completed: 0 | 1;
  position: number;
  created_at: string;
};

type Tag = {
  id: number;
  name: string;
  color: string;
};

type Template = {
  id: number;
  title: string;
  description: string | null;
  priority: "high" | "medium" | "low";
  subtasks_json: string;
  due_date_offset_days: number | null;
  created_at: string;
  updated_at: string;
};

type TodoDraft = {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  recurrence_pattern: "none" | "daily" | "weekly" | "monthly" | "yearly";
  due_date: string;
  reminder_minutes: string;
};

type FilterPreset = {
  name: string;
  search: string;
  priority: "all" | "high" | "medium" | "low";
  completion: "all" | "completed" | "incomplete";
  dateFrom: string;
  dateTo: string;
};

const emptyDraft: TodoDraft = {
  title: "",
  description: "",
  priority: "medium",
  recurrence_pattern: "none",
  due_date: "",
  reminder_minutes: "none",
};

const REMINDER_LABELS: Record<string, string> = {
  none: "No reminder",
  "15": "15 minutes before",
  "30": "30 minutes before",
  "60": "1 hour before",
  "120": "2 hours before",
  "1440": "1 day before",
  "2880": "2 days before",
  "10080": "1 week before",
};

const TAG_COLORS = [
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#6B7280",
];

function toLocalInputDateTime(isoText: string): string {
  const date = new Date(isoText);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromLocalInputDateTime(localText: string): string {
  return new Date(localText).toISOString();
}

export default function Home() {
  const router = useRouter();

  // ── Todo state ───────────────────────────────────────────────────────
  const [todos, setTodos] = useState<Todo[]>([]);
  const [draft, setDraft] = useState<TodoDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enteringTodoIds, setEnteringTodoIds] = useState<number[]>([]);
  const [completingTodoIds, setCompletingTodoIds] = useState<number[]>([]);
  const [deletingTodoIds, setDeletingTodoIds] = useState<number[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<
    "all" | "high" | "medium" | "low"
  >("all");
  const animationTimeoutsRef = useRef<number[]>([]);

  // ── Search & advanced filter state (HEAD) ────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [completionFilter, setCompletionFilter] = useState<
    "all" | "completed" | "incomplete"
  >("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState("");

  // ── Tag filter state (jesman) ────────────────────────────────────────
  const [tagFilter, setTagFilter] = useState<number | null>(null);

  // ── Subtask state ────────────────────────────────────────────────────
  const [subtasksMap, setSubtasksMap] = useState<Record<number, Subtask[]>>({});
  const [expandedTodo, setExpandedTodo] = useState<number | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  // ── Tag state ────────────────────────────────────────────────────────
  const [tags, setTags] = useState<Tag[]>([]);
  const [todoTagsMap, setTodoTagsMap] = useState<Record<number, Tag[]>>({});
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [showTagManager, setShowTagManager] = useState(false);

  // ── Template state ───────────────────────────────────────────────────
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateDraft, setTemplateDraft] = useState({
    title: "",
    description: "",
    priority: "medium" as "high" | "medium" | "low",
    subtasks: "",
    due_date_offset_days: "",
  });

  const editingTodo = useMemo(
    () => todos.find((todo) => todo.id === editingId) ?? null,
    [editingId, todos],
  );

  // ── Data fetching ────────────────────────────────────────────────────

  const fetchTodos = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/todos", { method: "GET" });
      const payload = (await response.json()) as {
        data?: Todo[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || "Failed to fetch todos.");
      setTodos(payload.data ?? []);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to fetch todos.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  async function fetchTags() {
    try {
      const response = await fetch("/api/tags");
      const payload = (await response.json()) as { data?: Tag[] };
      if (response.ok) setTags(payload.data ?? []);
    } catch {
      /* silent */
    }
  }

  async function fetchTemplates() {
    try {
      const response = await fetch("/api/templates");
      const payload = (await response.json()) as { data?: Template[] };
      if (response.ok) setTemplates(payload.data ?? []);
    } catch {
      /* silent */
    }
  }

  async function fetchSubtasks(todoId: number) {
    try {
      const response = await fetch(`/api/todos/${todoId}/subtasks`);
      const payload = (await response.json()) as { data?: Subtask[] };
      if (response.ok) {
        setSubtasksMap((prev) => ({ ...prev, [todoId]: payload.data ?? [] }));
      }
    } catch {
      /* silent */
    }
  }

  useEffect(() => {
    void fetchTodos();
    void fetchTags();
    void fetchTemplates();
    loadPresets();
  }, [fetchTodos]);

  useEffect(() => {
    const savedTheme = localStorage.getItem("themeMode");
    if (savedTheme === "dark") {
      setIsDarkMode(true);
    }
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add("dark-mode");
      localStorage.setItem("themeMode", "dark");
    } else {
      document.body.classList.remove("dark-mode");
      localStorage.setItem("themeMode", "light");
    }
  }, [isDarkMode]);

  function loadPresets() {
    try {
      const saved = localStorage.getItem("filterPresets");
      if (saved) {
        setPresets(JSON.parse(saved) as FilterPreset[]);
      }
    } catch {
      // Ignore errors loading presets
    }
  }

  function savePresets(updatedPresets: FilterPreset[]) {
    try {
      localStorage.setItem("filterPresets", JSON.stringify(updatedPresets));
      setPresets(updatedPresets);
    } catch {
      // Ignore errors saving presets
    }
  }

  // ── Notification polling ─────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/notifications/check");
        const payload = (await response.json()) as { data?: Todo[] };
        if (!response.ok || !payload.data?.length) return;

        for (const todo of payload.data) {
          if (typeof window !== "undefined" && "Notification" in window) {
            if (Notification.permission === "granted") {
              new Notification(`Reminder: ${todo.title}`, {
                body: todo.description || `Due: ${todo.due_date}`,
              });
            } else if (Notification.permission !== "denied") {
              await Notification.requestPermission();
            }
          }
          await fetch("/api/notifications/dismiss", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ todo_id: todo.id }),
          });
        }
      } catch {
        /* silent */
      }
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // ── Request notification permission on first click ──────────────────
  useEffect(() => {
    function requestPermission() {
      if ("Notification" in window && Notification.permission === "default") {
        void Notification.requestPermission();
      }
      document.removeEventListener("click", requestPermission);
    }
    document.addEventListener("click", requestPermission);
    return () => document.removeEventListener("click", requestPermission);
  }, []);

  useEffect(() => {
    return () => {
      for (const timeoutId of animationTimeoutsRef.current) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────

  function resetFeedback() {
    setMessage(null);
    setError(null);
  }

  const markTodoAsEntering = useCallback((todoId: number) => {
    setEnteringTodoIds((current) =>
      current.includes(todoId) ? current : [...current, todoId],
    );

    const timeoutId = window.setTimeout(() => {
      setEnteringTodoIds((current) => current.filter((id) => id !== todoId));
      animationTimeoutsRef.current = animationTimeoutsRef.current.filter(
        (id) => id !== timeoutId,
      );
    }, 450);

    animationTimeoutsRef.current.push(timeoutId);
  }, []);

  const markTodoAsCompleting = useCallback((todoId: number) => {
    setCompletingTodoIds((current) =>
      current.includes(todoId) ? current : [...current, todoId],
    );

    const timeoutId = window.setTimeout(() => {
      setCompletingTodoIds((current) => current.filter((id) => id !== todoId));
      animationTimeoutsRef.current = animationTimeoutsRef.current.filter(
        (id) => id !== timeoutId,
      );
    }, 320);

    animationTimeoutsRef.current.push(timeoutId);
  }, []);

  const markTodoAsDeleting = useCallback((todoId: number) => {
    setDeletingTodoIds((current) =>
      current.includes(todoId) ? current : [...current, todoId],
    );

    const timeoutId = window.setTimeout(() => {
      setTodos((current) => current.filter((item) => item.id !== todoId));
      animationTimeoutsRef.current = animationTimeoutsRef.current.filter(
        (id) => id !== timeoutId,
      );
    }, 180);

    animationTimeoutsRef.current.push(timeoutId);
    return timeoutId;
  }, []);

  function startEdit(todo: Todo) {
    setEditingId(todo.id);
    setDraft({
      title: todo.title,
      description: todo.description ?? "",
      priority: todo.priority,
      recurrence_pattern: todo.recurrence_pattern ?? "none",
      due_date: todo.due_date ? toLocalInputDateTime(todo.due_date) : "",
      reminder_minutes: todo.reminder_minutes
        ? String(todo.reminder_minutes)
        : "none",
    });
    resetFeedback();
  }

  function stopEdit() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  function validateDraft(current: TodoDraft): string | null {
    const trimmed = current.title.trim();
    if (!trimmed) return "Title is required.";
    if (trimmed.length > 120) return "Title must be 120 characters or less.";
    if (current.description.length > 500)
      return "Description must be 500 characters or less.";
    return null;
  }

  // ── Todo CRUD handlers ──────────────────────────────────────────────

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();

    const validationError = validateDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    const reminderMinutes =
      draft.reminder_minutes === "none" ? null : Number(draft.reminder_minutes);

    const optimisticTodo: Todo = {
      id: -Date.now(),
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      priority: draft.priority,
      recurrence_pattern:
        draft.recurrence_pattern === "none" ? null : draft.recurrence_pattern,
      due_date: draft.due_date ? fromLocalInputDateTime(draft.due_date) : null,
      completed: 0,
      reminder_minutes: reminderMinutes,
      last_notification_sent: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const previousTodos = todos;
    setTodos((current) => [optimisticTodo, ...current]);
    setIsSubmitting(true);
    setDraft(emptyDraft);

    try {
      const response = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: optimisticTodo.title,
          description: optimisticTodo.description,
          priority: optimisticTodo.priority,
          recurrence_pattern: optimisticTodo.recurrence_pattern,
          due_date: optimisticTodo.due_date,
          reminder_minutes: optimisticTodo.reminder_minutes,
        }),
      });

      const payload = (await response.json()) as {
        data?: Todo;
        error?: string;
      };
      if (!response.ok || !payload.data)
        throw new Error(payload.error || "Failed to create todo.");

      setTodos((current) =>
        current.map((todo) =>
          todo.id === optimisticTodo.id ? payload.data! : todo,
        ),
      );
      setMessage("Todo created.");
    } catch (createError) {
      setTodos(previousTodos);
      setError(
        createError instanceof Error
          ? createError.message
          : "Failed to create todo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggle(todo: Todo) {
    setError(null);
    const previousTodos = todos;
    const nextCompleted = todo.completed ? 0 : 1;

    if (todo.recurrence_pattern && nextCompleted === 1) {
      markTodoAsCompleting(todo.id);
    }

    setTodos((current) =>
      current.map((item) =>
        item.id === todo.id ? { ...item, completed: nextCompleted } : item,
      ),
    );

    try {
      const response = await fetch(`/api/todos/${todo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: Boolean(nextCompleted) }),
      });

      const payload = (await response.json()) as {
        data?: Todo;
        next_todo?: Todo;
        error?: string;
      };
      if (!response.ok || !payload.data)
        throw new Error(payload.error || "Failed to update todo.");

      const nextTodo = payload.next_todo as Todo | undefined;

      setTodos((current) => {
        const updated = current.map((item) =>
          item.id === todo.id ? payload.data! : item,
        );

        if (!nextTodo) {
          return updated;
        }

        const currentTodoIndex = updated.findIndex(
          (item) => item.id === todo.id,
        );
        if (currentTodoIndex === -1) {
          return [nextTodo, ...updated];
        }

        const withNext = [...updated];
        withNext.splice(currentTodoIndex + 1, 0, nextTodo);
        return withNext;
      });
      if (nextTodo) {
        markTodoAsEntering(nextTodo.id);
      }
    } catch (updateError) {
      setTodos(previousTodos);
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update todo.",
      );
    }
  }

  async function handleDelete(todo: Todo) {
    resetFeedback();
    const previousTodos = todos;
    setTodos((current) => current.filter((item) => item.id !== todo.id));

    try {
      const response = await fetch(`/api/todos/${todo.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.success)
        throw new Error(payload.error || "Failed to delete todo.");
      if (editingId === todo.id) stopEdit();
      setMessage("Todo deleted.");
    } catch (deleteError) {
      setTodos(previousTodos);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete todo.",
      );
    }
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTodo) return;
    resetFeedback();

    const validationError = validateDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    const reminderMinutes =
      draft.reminder_minutes === "none" ? null : Number(draft.reminder_minutes);

    const previousTodos = todos;
    const optimisticUpdate: Todo = {
      ...editingTodo,
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      priority: draft.priority,
      recurrence_pattern:
        draft.recurrence_pattern === "none" ? null : draft.recurrence_pattern,
      due_date: draft.due_date ? fromLocalInputDateTime(draft.due_date) : null,
      reminder_minutes: reminderMinutes,
      updated_at: new Date().toISOString(),
    };

    setTodos((current) =>
      current.map((item) =>
        item.id === editingTodo.id ? optimisticUpdate : item,
      ),
    );
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/todos/${editingTodo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: optimisticUpdate.title,
          description: optimisticUpdate.description,
          priority: optimisticUpdate.priority,
          recurrence_pattern: optimisticUpdate.recurrence_pattern,
          due_date: optimisticUpdate.due_date,
          reminder_minutes: optimisticUpdate.reminder_minutes,
        }),
      });

      const payload = (await response.json()) as {
        data?: Todo;
        error?: string;
      };
      if (!response.ok || !payload.data)
        throw new Error(payload.error || "Failed to update todo.");

      setTodos((current) =>
        current.map((item) =>
          item.id === editingTodo.id ? payload.data! : item,
        ),
      );
      setMessage("Todo updated.");
      stopEdit();
    } catch (updateError) {
      setTodos(previousTodos);
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update todo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Export / Import handlers (HEAD) ─────────────────────────────────

  async function handleExport(format: "json" | "csv") {
    try {
      const response = await fetch(`/api/todos/export?format=${format}`);
      if (!response.ok) {
        setError("Failed to export todos.");
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `todos-${new Date().toISOString().split("T")[0]}.${format === "json" ? "json" : "csv"}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setMessage(`Exported as ${format.toUpperCase()}`);
    } catch {
      setError(`Failed to export as ${format.toUpperCase()}`);
    }
  }

  async function handleImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text) as unknown;

        const response = await fetch("/api/todos/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        const payload = (await response.json()) as {
          imported?: number;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Failed to import todos.");
        }

        setMessage(`Successfully imported ${payload.imported || 0} todos`);
        void fetchTodos();
      } catch {
        setError("Failed to import todos. Please check the file format.");
      }
    };
    input.click();
  }

  // ── Subtask handlers ────────────────────────────────────────────────

  function toggleExpand(todoId: number) {
    if (expandedTodo === todoId) {
      setExpandedTodo(null);
    } else {
      setExpandedTodo(todoId);
      void fetchSubtasks(todoId);
    }
    setNewSubtaskTitle("");
  }

  async function handleAddSubtask(todoId: number) {
    const title = newSubtaskTitle.trim();
    if (!title) return;

    try {
      const response = await fetch(`/api/todos/${todoId}/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (response.ok) {
        setNewSubtaskTitle("");
        await fetchSubtasks(todoId);
      }
    } catch {
      /* silent */
    }
  }

  async function handleToggleSubtask(todoId: number, subtask: Subtask) {
    try {
      await fetch(`/api/todos/${todoId}/subtasks/${subtask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !subtask.completed }),
      });
      await fetchSubtasks(todoId);
    } catch {
      /* silent */
    }
  }

  async function handleDeleteSubtask(todoId: number, subtaskId: number) {
    try {
      await fetch(`/api/todos/${todoId}/subtasks/${subtaskId}`, {
        method: "DELETE",
      });
      await fetchSubtasks(todoId);
    } catch {
      /* silent */
    }
  }

  // ── Tag handlers ─────────────────────────────────────────────────────

  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name) return;

    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: newTagColor }),
      });
      if (response.ok) {
        setNewTagName("");
        await fetchTags();
      }
    } catch {
      /* silent */
    }
  }

  async function handleDeleteTag(tagId: number) {
    try {
      await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
      await fetchTags();
      setTodoTagsMap((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          next[Number(key)] = next[Number(key)].filter((t) => t.id !== tagId);
        }
        return next;
      });
    } catch {
      /* silent */
    }
  }

  async function handleAddTagToTodo(todoId: number, tagId: number) {
    try {
      await fetch(`/api/todos/${todoId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag_id: tagId }),
      });
      const tag = tags.find((t) => t.id === tagId);
      if (tag) {
        setTodoTagsMap((prev) => ({
          ...prev,
          [todoId]: [
            ...(prev[todoId] ?? []).filter((t) => t.id !== tagId),
            tag,
          ],
        }));
      }
    } catch {
      /* silent */
    }
  }

  async function handleRemoveTagFromTodo(todoId: number, tagId: number) {
    try {
      await fetch(`/api/todos/${todoId}/tags/${tagId}`, { method: "DELETE" });
      setTodoTagsMap((prev) => ({
        ...prev,
        [todoId]: (prev[todoId] ?? []).filter((t) => t.id !== tagId),
      }));
    } catch {
      /* silent */
    }
  }

  // ── Template handlers ───────────────────────────────────────────────

  async function handleCreateTemplate() {
    if (!templateDraft.title.trim()) return;

    const subtasks = templateDraft.subtasks
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((title, i) => ({ title, position: i }));

    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: templateDraft.title.trim(),
          description: templateDraft.description.trim() || null,
          priority: templateDraft.priority,
          subtasks,
          due_date_offset_days: templateDraft.due_date_offset_days
            ? Number(templateDraft.due_date_offset_days)
            : null,
        }),
      });
      if (response.ok) {
        setTemplateDraft({
          title: "",
          description: "",
          priority: "medium",
          subtasks: "",
          due_date_offset_days: "",
        });
        await fetchTemplates();
        setMessage("Template created.");
      }
    } catch {
      /* silent */
    }
  }

  async function handleUseTemplate(templateId: number) {
    try {
      const response = await fetch(`/api/templates/${templateId}/use`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        data?: Todo;
        error?: string;
      };
      if (response.ok && payload.data) {
        await fetchTodos();
        setMessage("Todo created from template.");
      }
    } catch {
      /* silent */
    }
  }

  async function handleDeleteTemplate(templateId: number) {
    try {
      await fetch(`/api/templates/${templateId}`, { method: "DELETE" });
      await fetchTemplates();
    } catch {
      /* silent */
    }
  }

  // ── Filter preset handlers (HEAD) ───────────────────────────────────

  function handleSavePreset() {
    if (!presetName.trim()) {
      setError("Preset name is required.");
      return;
    }

    const newPreset: FilterPreset = {
      name: presetName,
      search: searchQuery,
      priority: priorityFilter,
      completion: completionFilter,
      dateFrom,
      dateTo,
    };

    const updatedPresets = [...presets, newPreset];
    savePresets(updatedPresets);
    setPresetName("");
    setShowSavePreset(false);
    setMessage("Filter preset saved.");
  }

  function applyPreset(preset: FilterPreset) {
    setSearchQuery(preset.search);
    setPriorityFilter(preset.priority);
    setCompletionFilter(preset.completion);
    setDateFrom(preset.dateFrom);
    setDateTo(preset.dateTo);
  }

  function deletePreset(name: string) {
    const updatedPresets = presets.filter((p) => p.name !== name);
    savePresets(updatedPresets);
  }

  const hasActiveFilters =
    searchQuery ||
    priorityFilter !== "all" ||
    completionFilter !== "all" ||
    dateFrom ||
    dateTo;

  function clearAllFilters() {
    setSearchQuery("");
    setPriorityFilter("all");
    setCompletionFilter("all");
    setDateFrom("");
    setDateTo("");
    setTagFilter(null);
  }

  // ── Filtered todos (merged: search, priority, completion, date, tag) ─

  const visibleTodos = useMemo(() => {
    let filtered = todos;

    // Priority filter
    if (priorityFilter !== "all") {
      filtered = filtered.filter((todo) => todo.priority === priorityFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((todo) =>
        todo.title.toLowerCase().includes(query),
      );
    }

    // Completion filter
    if (completionFilter === "completed") {
      filtered = filtered.filter((todo) => todo.completed);
    } else if (completionFilter === "incomplete") {
      filtered = filtered.filter((todo) => !todo.completed);
    }

    // Date range filter
    if (dateFrom || dateTo) {
      filtered = filtered.filter((todo) => {
        if (!todo.due_date) return false;
        const dueDate = new Date(todo.due_date);
        if (dateFrom) {
          const from = new Date(dateFrom);
          if (dueDate < from) return false;
        }
        if (dateTo) {
          const to = new Date(dateTo);
          to.setHours(23, 59, 59, 999);
          if (dueDate > to) return false;
        }
        return true;
      });
    }

    // Tag filter
    if (tagFilter !== null) {
      const todoIdsWithTag = new Set(
        Object.entries(todoTagsMap)
          .filter(([, tags]) => tags.some((t) => t.id === tagFilter))
          .map(([id]) => Number(id)),
      );
      filtered = filtered.filter((todo) => todoIdsWithTag.has(todo.id));
    }

    return filtered;
  }, [
    todos,
    priorityFilter,
    searchQuery,
    completionFilter,
    dateFrom,
    dateTo,
    tagFilter,
    todoTagsMap,
  ]);

  // ── Subtask progress helpers ─────────────────────────────────────────

  function getProgress(todoId: number) {
    const subs = subtasksMap[todoId];
    if (!subs || subs.length === 0) return null;
    const done = subs.filter((s) => s.completed).length;
    return {
      done,
      total: subs.length,
      percent: Math.round((done / subs.length) * 100),
    };
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <main>
      <div className="container stack">
        <header className="stack">
          <div className="row between">
            <div>
              <h1>Todo App</h1>
              <p className="muted">
                Full-featured todo manager with priorities, recurrence,
                reminders, subtasks, tags, templates, and calendar view.
              </p>
            </div>
            <div className="row">
              <Link href="/calendar">
                <button className="secondary">📅 Calendar</button>
              </Link>
              <button
                className="secondary"
                onClick={() => handleExport("json")}
              >
                Export JSON
              </button>
              <button className="secondary" onClick={() => handleExport("csv")}>
                Export CSV
              </button>
              <button className="secondary" onClick={handleImport}>
                Import
              </button>
              <button
                className="secondary"
                style={{ background: "#ef4444", color: "white" }}
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  router.push("/login");
                }}
              >
                Logout
              </button>
            </div>
          </div>
          <div className="row">
            <button
              className="secondary"
              onClick={() => setShowTagManager(!showTagManager)}
            >
              {showTagManager ? "Hide Tags" : "Manage Tags"}
            </button>
            <button
              className="secondary"
              onClick={() => {
                setShowTemplates(!showTemplates);
                if (!showTemplates) void fetchTemplates();
              }}
            >
              {showTemplates ? "Hide Templates" : "Templates"}
            </button>
          </div>
        </header>

        {/* ── Tag Manager ─────────────────────────────────────────── */}
        {showTagManager && (
          <section className="card stack">
            <h2>Tag Manager</h2>
            <div className="row">
              <input
                placeholder="Tag name"
                value={newTagName}
                maxLength={50}
                onChange={(e) => setNewTagName(e.target.value)}
                style={{ flex: 1 }}
              />
              <div className="row">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewTagColor(c)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: c,
                      border:
                        c === newTagColor
                          ? "3px solid #3b2414"
                          : "2px solid transparent",
                      padding: 0,
                      minWidth: 0,
                    }}
                  />
                ))}
              </div>
              <button
                className="primary"
                onClick={() => void handleCreateTag()}
              >
                Add Tag
              </button>
            </div>
            <div className="row">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className="badge"
                  style={{
                    background: tag.color + "22",
                    color: tag.color,
                    border: `1px solid ${tag.color}`,
                  }}
                >
                  {tag.name}
                  <button
                    onClick={() => void handleDeleteTag(tag.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: tag.color,
                      cursor: "pointer",
                      padding: "0 0 0 4px",
                      fontSize: "0.8rem",
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
              {tags.length === 0 && <p className="muted">No tags yet.</p>}
            </div>
          </section>
        )}

        {/* ── Template Manager ────────────────────────────────────── */}
        {showTemplates && (
          <section className="card stack">
            <h2>Templates</h2>
            <div className="stack">
              <input
                placeholder="Template title"
                value={templateDraft.title}
                maxLength={120}
                onChange={(e) =>
                  setTemplateDraft({ ...templateDraft, title: e.target.value })
                }
              />
              <textarea
                placeholder="Description (optional)"
                value={templateDraft.description}
                maxLength={500}
                rows={2}
                onChange={(e) =>
                  setTemplateDraft({
                    ...templateDraft,
                    description: e.target.value,
                  })
                }
              />
              <div className="row">
                <select
                  value={templateDraft.priority}
                  onChange={(e) =>
                    setTemplateDraft({
                      ...templateDraft,
                      priority: e.target.value as "high" | "medium" | "low",
                    })
                  }
                  style={{ flex: 1 }}
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <input
                  type="number"
                  placeholder="Due offset (days)"
                  value={templateDraft.due_date_offset_days}
                  min="0"
                  onChange={(e) =>
                    setTemplateDraft({
                      ...templateDraft,
                      due_date_offset_days: e.target.value,
                    })
                  }
                  style={{ flex: 1 }}
                />
              </div>
              <textarea
                placeholder="Subtasks (one per line)"
                value={templateDraft.subtasks}
                rows={3}
                onChange={(e) =>
                  setTemplateDraft({
                    ...templateDraft,
                    subtasks: e.target.value,
                  })
                }
              />
              <button
                className="primary"
                onClick={() => void handleCreateTemplate()}
              >
                Save Template
              </button>
            </div>
            {templates.map((tmpl) => {
              const subs = (() => {
                try {
                  return JSON.parse(tmpl.subtasks_json) as { title: string }[];
                } catch {
                  return [];
                }
              })();
              return (
                <article key={tmpl.id} className="todo">
                  <div className="row between">
                    <div className="row">
                      <h3>{tmpl.title}</h3>
                      <span className={`badge ${tmpl.priority}`}>
                        {tmpl.priority.toUpperCase()}
                      </span>
                    </div>
                    <div className="row">
                      <button
                        className="primary"
                        onClick={() => void handleUseTemplate(tmpl.id)}
                      >
                        Use
                      </button>
                      <button
                        className="danger"
                        onClick={() => void handleDeleteTemplate(tmpl.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {tmpl.description && (
                    <p className="muted">{tmpl.description}</p>
                  )}
                  <p className="muted">
                    Offset: {tmpl.due_date_offset_days ?? "None"} days
                    {subs.length > 0 ? ` · ${subs.length} subtask(s)` : ""}
                  </p>
                </article>
              );
            })}
            {templates.length === 0 && (
              <p className="muted">No templates yet.</p>
            )}
          </section>
        )}

        {/* ── Create / Edit Form ──────────────────────────────────── */}
        <section className="card stack">
          <div className="row between">
            <h2>{editingTodo ? "Edit Todo" : "Create Todo"}</h2>
            <button
              type="button"
              className="secondary theme-toggle"
              onClick={() => setIsDarkMode((current) => !current)}
              aria-label={
                isDarkMode ? "Switch to light mode" : "Switch to dark mode"
              }
              title={
                isDarkMode ? "Switch to light mode" : "Switch to dark mode"
              }
            >
              {isDarkMode ? "☀" : "☾"}
            </button>
          </div>
          <form
            className="stack"
            onSubmit={editingTodo ? handleSaveEdit : handleCreate}
          >
            <input
              placeholder="Title"
              value={draft.title}
              maxLength={120}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
            <textarea
              placeholder="Description (optional)"
              value={draft.description}
              maxLength={500}
              rows={3}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
            <div className="field-block">
              <p className="field-label">Priority</p>
              <select
                value={draft.priority}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    priority: event.target.value as "high" | "medium" | "low",
                  }))
                }
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="field-block">
              <p className="field-label">Recurrence</p>
              <select
                value={draft.recurrence_pattern}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    recurrence_pattern: event.target.value as
                      | "none"
                      | "daily"
                      | "weekly"
                      | "monthly"
                      | "yearly",
                  }))
                }
              >
                <option value="none">No recurrence</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div className="field-block">
              <p className="field-label">Due Date</p>
              <input
                type="datetime-local"
                value={draft.due_date}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    due_date: event.target.value,
                  }))
                }
              />
            </div>
            <div className="field-block">
              <p className="field-label">Reminder</p>
              <select
                value={draft.reminder_minutes}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    reminder_minutes: event.target.value,
                  }))
                }
              >
                {Object.entries(REMINDER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <button className="primary" type="submit" disabled={isSubmitting}>
                {editingTodo ? "Save Changes" : "Add Todo"}
              </button>
              {editingTodo ? (
                <button
                  className="secondary"
                  type="button"
                  onClick={stopEdit}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
          {error ? <div className="error">{error}</div> : null}
          {message ? <div className="success">{message}</div> : null}
        </section>

        {/* ── Todo List ───────────────────────────────────────────── */}
        <section className="card stack">
          <div className="row between">
            <h2>Todos</h2>
            <div className="row">
              <select
                value={priorityFilter}
                onChange={(event) =>
                  setPriorityFilter(
                    event.target.value as "all" | "high" | "medium" | "low",
                  )
                }
              >
                <option value="all">All Priorities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              {tags.length > 0 && (
                <select
                  value={tagFilter ?? ""}
                  onChange={(e) =>
                    setTagFilter(e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">All Tags</option>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
              )}
              <button className="secondary" onClick={() => void fetchTodos()}>
                Refresh
              </button>
            </div>
          </div>

          <div>
            <input
              type="text"
              placeholder="🔍 Search todos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>

          <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              className="secondary"
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                backgroundColor: showAdvanced ? "#3B82F6" : undefined,
                color: showAdvanced ? "white" : undefined,
              }}
            >
              {showAdvanced ? "▼" : "▶"} Advanced
            </button>

            {hasActiveFilters && (
              <>
                <button
                  className="secondary"
                  style={{ backgroundColor: "#EF4444", color: "white" }}
                  onClick={clearAllFilters}
                >
                  Clear All
                </button>
                <button
                  className="secondary"
                  style={{ backgroundColor: "#10B981", color: "white" }}
                  onClick={() => setShowSavePreset(true)}
                >
                  💾 Save Filter
                </button>
              </>
            )}
          </div>

          {showAdvanced && (
            <div
              style={{
                backgroundColor: "#F3F4F6",
                padding: "1rem",
                borderRadius: "0.5rem",
              }}
            >
              <div className="row between">
                <div className="row">
                  <div style={{ flex: 1 }}>
                    <label
                      style={{ display: "block", marginBottom: "0.25rem" }}
                    >
                      Completion Status
                    </label>
                    <select
                      value={completionFilter}
                      onChange={(e) =>
                        setCompletionFilter(
                          e.target.value as "all" | "completed" | "incomplete",
                        )
                      }
                    >
                      <option value="all">All Todos</option>
                      <option value="incomplete">Incomplete Only</option>
                      <option value="completed">Completed Only</option>
                    </select>
                  </div>
                </div>

                <div className="row">
                  <div style={{ flex: 1 }}>
                    <label
                      style={{ display: "block", marginBottom: "0.25rem" }}
                    >
                      Due Date From
                    </label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>

                  <div style={{ flex: 1 }}>
                    <label
                      style={{ display: "block", marginBottom: "0.25rem" }}
                    >
                      Due Date To
                    </label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {presets.length > 0 && (
                <div
                  style={{
                    marginTop: "1rem",
                    paddingTop: "1rem",
                    borderTop: "1px solid #D1D5DB",
                  }}
                >
                  <p
                    style={{
                      fontSize: "0.875rem",
                      marginBottom: "0.5rem",
                      color: "#6B7280",
                    }}
                  >
                    Saved Filter Presets
                  </p>
                  <div
                    className="row"
                    style={{ gap: "0.5rem", flexWrap: "wrap" }}
                  >
                    {presets.map((preset) => (
                      <div
                        key={preset.name}
                        className="row"
                        style={{
                          backgroundColor: "white",
                          padding: "0.25rem 0.75rem",
                          borderRadius: "0.25rem",
                          border: "1px solid #D1D5DB",
                          gap: "0.5rem",
                        }}
                      >
                        <button
                          className="secondary"
                          style={{
                            padding: "0.25rem 0.5rem",
                            fontSize: "0.875rem",
                          }}
                          onClick={() => applyPreset(preset)}
                        >
                          {preset.name}
                        </button>
                        <button
                          className="secondary"
                          style={{
                            padding: "0.25rem 0.5rem",
                            fontSize: "0.875rem",
                            backgroundColor: "#EF4444",
                            color: "white",
                          }}
                          onClick={() => deletePreset(preset.name)}
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

          {showSavePreset && (
            <div
              style={{
                backgroundColor: "#FEF3C7",
                padding: "1rem",
                borderRadius: "0.5rem",
                marginBottom: "1rem",
              }}
            >
              <div className="row">
                <input
                  type="text"
                  placeholder="Preset name"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  className="secondary"
                  onClick={handleSavePreset}
                  style={{ backgroundColor: "#10B981", color: "white" }}
                >
                  Save
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setShowSavePreset(false);
                    setPresetName("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {isLoading ? <p className="muted">Loading...</p> : null}

          {!isLoading && visibleTodos.length === 0 ? (
            <p className="muted">No todos match your criteria.</p>
          ) : null}

          {visibleTodos.map((todo) => {
            const progress = getProgress(todo.id);
            const todoTags = todoTagsMap[todo.id] ?? [];
            const isExpanded = expandedTodo === todo.id;

            return (
              <article
                key={todo.id}
                className={`todo ${todo.completed ? "done" : ""} ${enteringTodoIds.includes(todo.id) ? "todo-entering" : ""} ${completingTodoIds.includes(todo.id) ? "todo-completing" : ""} ${deletingTodoIds.includes(todo.id) ? "todo-deleting" : ""}`}
              >
                <div className="row between">
                  <div className="row">
                    <h3 style={{ margin: 0 }}>{todo.title}</h3>
                    <span className={`badge ${todo.priority}`}>
                      {todo.priority.toUpperCase()}
                    </span>
                    {todo.reminder_minutes && (
                      <span
                        className="badge"
                        style={{
                          background: "#dbeafe",
                          color: "#1e40af",
                          border: "1px solid #93c5fd",
                        }}
                      >
                        🔔{" "}
                        {REMINDER_LABELS[String(todo.reminder_minutes)] ??
                          `${todo.reminder_minutes}m`}
                      </span>
                    )}
                    {todo.recurrence_pattern && (
                      <span
                        className="badge"
                        style={{
                          background: "#f0fdf4",
                          color: "#166534",
                          border: "1px solid #86efac",
                        }}
                      >
                        🔄 {todo.recurrence_pattern}
                      </span>
                    )}
                  </div>
                  <div className="row">
                    <label
                      className="todo-complete-toggle"
                      title="Toggle completion"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(todo.completed)}
                        onChange={() => void handleToggle(todo)}
                        aria-label={`Mark ${todo.title} as completed`}
                      />
                      <span>{todo.completed ? "Done" : "Complete"}</span>
                    </label>
                    <button
                      className="secondary"
                      onClick={() => startEdit(todo)}
                      disabled={editingId === todo.id}
                    >
                      Edit
                    </button>
                    <button
                      className="secondary"
                      onClick={() => toggleExpand(todo.id)}
                    >
                      {isExpanded ? "Hide" : "Subtasks"}
                    </button>
                    <button
                      className="danger"
                      onClick={() => void handleDelete(todo)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {todo.description ? <p>{todo.description}</p> : null}

                {/* Tag badges */}
                {todoTags.length > 0 && (
                  <div className="row">
                    {todoTags.map((tag) => (
                      <span
                        key={tag.id}
                        className="badge"
                        style={{
                          background: tag.color + "22",
                          color: tag.color,
                          border: `1px solid ${tag.color}`,
                        }}
                      >
                        {tag.name}
                        <button
                          onClick={() =>
                            void handleRemoveTagFromTodo(todo.id, tag.id)
                          }
                          style={{
                            background: "none",
                            border: "none",
                            color: tag.color,
                            cursor: "pointer",
                            padding: "0 0 0 4px",
                            fontSize: "0.8rem",
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Add tag selector */}
                {tags.length > 0 && (
                  <div className="row">
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          void handleAddTagToTodo(
                            todo.id,
                            Number(e.target.value),
                          );
                          e.target.value = "";
                        }
                      }}
                      style={{ fontSize: "0.8rem", padding: "0.3rem" }}
                    >
                      <option value="">+ Add tag</option>
                      {tags
                        .filter((t) => !todoTags.some((tt) => tt.id === t.id))
                        .map((tag) => (
                          <option key={tag.id} value={tag.id}>
                            {tag.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {/* Progress bar */}
                {progress && (
                  <div style={{ marginTop: 4 }}>
                    <div
                      style={{
                        background: "#e5e7eb",
                        borderRadius: 6,
                        height: 8,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${progress.percent}%`,
                          height: "100%",
                          borderRadius: 6,
                          background:
                            progress.percent === 100
                              ? "#22c55e"
                              : progress.percent > 0
                                ? "#3b82f6"
                                : "#9ca3af",
                          transition: "width 0.3s",
                        }}
                      />
                    </div>
                    <p
                      className="muted"
                      style={{ fontSize: "0.75rem", marginTop: 2 }}
                    >
                      {progress.done}/{progress.total} subtasks (
                      {progress.percent}%)
                    </p>
                  </div>
                )}

                {/* Subtask panel */}
                {isExpanded && (
                  <div
                    style={{
                      marginTop: 8,
                      paddingLeft: 8,
                      borderLeft: "2px solid #e6c9ab",
                    }}
                  >
                    {(subtasksMap[todo.id] ?? []).map((sub) => (
                      <div
                        key={sub.id}
                        className="row"
                        style={{ gap: "0.4rem", padding: "0.2rem 0" }}
                      >
                        <span
                          style={{
                            flex: 1,
                            textDecoration: sub.completed
                              ? "line-through"
                              : "none",
                            opacity: sub.completed ? 0.6 : 1,
                          }}
                        >
                          {sub.title}
                        </span>
                        <label
                          className="subtask-complete-toggle"
                          title="Toggle subtask completion"
                        >
                          <input
                            type="checkbox"
                            checked={!!sub.completed}
                            onChange={() =>
                              void handleToggleSubtask(todo.id, sub)
                            }
                            aria-label={`Mark subtask ${sub.title} as completed`}
                          />
                          <span>{sub.completed ? "Done" : "Complete"}</span>
                        </label>
                        <button
                          onClick={() =>
                            void handleDeleteSubtask(todo.id, sub.id)
                          }
                          style={{
                            background: "none",
                            border: "none",
                            color: "#a9442f",
                            cursor: "pointer",
                            padding: 0,
                            fontSize: "0.9rem",
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <div className="row" style={{ marginTop: 4 }}>
                      <input
                        placeholder="New subtask"
                        value={newSubtaskTitle}
                        maxLength={200}
                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleAddSubtask(todo.id);
                          }
                        }}
                        style={{
                          flex: 1,
                          fontSize: "0.85rem",
                          padding: "0.35rem 0.5rem",
                        }}
                      />
                      <button
                        className="secondary"
                        onClick={() => void handleAddSubtask(todo.id)}
                        style={{
                          fontSize: "0.8rem",
                          padding: "0.35rem 0.6rem",
                        }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}

                {todo.due_date && (
                  <p className="muted">
                    Due:{" "}
                    {new Date(todo.due_date).toLocaleString("en-SG", {
                      timeZone: "Asia/Singapore",
                    })}
                  </p>
                )}

                {todo.recurrence_pattern && (
                  <p className="muted">
                    Recurrence:{" "}
                    {todo.recurrence_pattern[0].toUpperCase() +
                      todo.recurrence_pattern.slice(1)}
                  </p>
                )}

                <p className="muted">
                  Updated:{" "}
                  {new Date(todo.updated_at).toLocaleString("en-SG", {
                    timeZone: "Asia/Singapore",
                  })}
                </p>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
