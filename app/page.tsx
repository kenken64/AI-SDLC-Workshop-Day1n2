"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useNotifications } from "@/lib/hooks/useNotifications";
import { reminderMinutesToOption, reminderOptionToMinutes } from "@/lib/validation";

type Priority = "high" | "medium" | "low";
type RecurrencePattern = "daily" | "weekly" | "monthly" | "yearly";
type ReminderOption = keyof typeof reminderOptionToMinutes;

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Subtask {
  id: string;
  todo_id: string;
  title: string;
  completed: boolean;
  position: number;
}

interface Todo {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  priority: Priority;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  tags: Tag[];
  subtasks: Subtask[];
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  title: string;
  priority: Priority;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
}

const PRIORITY_ORDER: Priority[] = ["high", "medium", "low"];

function sortByPriorityAndDate(items: Todo[]): Todo[] {
  return [...items].sort((left, right) => {
    const priorityScore = PRIORITY_ORDER.indexOf(left.priority) - PRIORITY_ORDER.indexOf(right.priority);
    if (priorityScore !== 0) {
      return priorityScore;
    }

    if (!left.due_date && right.due_date) {
      return 1;
    }

    if (left.due_date && !right.due_date) {
      return -1;
    }

    if (!left.due_date && !right.due_date) {
      return 0;
    }

    return new Date(left.due_date || 0).getTime() - new Date(right.due_date || 0).getTime();
  });
}

function dueState(todo: Todo): "overdue" | "active" | "completed" {
  if (todo.completed) {
    return "completed";
  }

  if (todo.due_date && new Date(todo.due_date).getTime() < Date.now()) {
    return "overdue";
  }

  return "active";
}

function progress(subtasks: Subtask[]): { completed: number; total: number; percentage: number } {
  const total = subtasks.length;
  const completed = subtasks.filter((item) => item.completed).length;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percentage };
}

function formatDueDate(dueDate: string | null): string {
  if (!dueDate) {
    return "No due date";
  }

  return new Date(dueDate).toLocaleString("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
    timeZone: "Asia/Singapore",
  });
}

function isoToLocalDateTimeInput(isoDate: string | null): string {
  if (!isoDate) {
    return "";
  }

  const date = new Date(isoDate);
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  const local = new Date(date.getTime() - timezoneOffsetMs);
  return local.toISOString().slice(0, 16);
}

function localDateTimeInputToIso(localDateTime: string): string {
  return new Date(localDateTime).toISOString();
}

export default function HomePage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [username, setUsername] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDateLocal, setDueDateLocal] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrencePattern | "none">("none");
  const [reminderOption, setReminderOption] = useState<ReminderOption>("none");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [tagFilter, setTagFilter] = useState<string>("all");

  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<Priority>("medium");
  const [editDueDate, setEditDueDate] = useState("");
  const [editRecurrence, setEditRecurrence] = useState<RecurrencePattern | "none">("none");
  const [editReminderOption, setEditReminderOption] = useState<ReminderOption>("none");
  const [editTagIds, setEditTagIds] = useState<string[]>([]);

  const [expandedTodoIds, setExpandedTodoIds] = useState<string[]>([]);
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, string>>({});

  const [showTagModal, setShowTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3B82F6");

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateFilter, setTemplateFilter] = useState<string>("all");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { enabled: notificationsEnabled, requestPermission } = useNotifications();

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim().toLowerCase());
    }, 300);

    return () => {
      window.clearTimeout(handle);
    };
  }, [searchQuery]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMessage(null);

    try {
      const [meResponse, todosResponse, tagsResponse, templatesResponse] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/todos"),
        fetch("/api/tags"),
        fetch("/api/templates"),
      ]);

      const meJson = (await meResponse.json()) as { success: boolean; user?: { username: string } };
      const todosJson = (await todosResponse.json()) as { success: boolean; data?: Todo[]; error?: string };
      const tagsJson = (await tagsResponse.json()) as { success: boolean; data?: Tag[] };
      const templatesJson = (await templatesResponse.json()) as { success: boolean; data?: Template[] };

      if (!todosResponse.ok || !todosJson.success) {
        setMessage(todosJson.error || "Failed to load todos");
      } else {
        setTodos(sortByPriorityAndDate(todosJson.data || []));
      }

      setUsername(meJson.user?.username || "");
      setTags(tagsJson.data || []);
      setTemplates(templatesJson.data || []);
    } catch {
      setMessage("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const resetCreateForm = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setDueDateLocal("");
    setRecurrence("none");
    setReminderOption("none");
    setSelectedTagIds([]);
  };

  const createTodo = async () => {
    if (!title.trim()) {
      setMessage("Title is required");
      return;
    }

    const optimisticTodo: Todo = {
      id: `temp-${Math.random().toString(16).slice(2)}`,
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDateLocal ? new Date(dueDateLocal).toISOString() : null,
      completed: false,
      priority,
      recurrence_pattern: recurrence === "none" ? null : recurrence,
      reminder_minutes: reminderOptionToMinutes[reminderOption],
      tags: tags.filter((tag) => selectedTagIds.includes(tag.id)),
      subtasks: [],
    };

    setTodos((current) => sortByPriorityAndDate([optimisticTodo, ...current]));

    try {
      const response = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueDateLocal ? new Date(dueDateLocal).toISOString() : null,
          priority,
          recurrence_pattern: recurrence === "none" ? null : recurrence,
          reminder_minutes: reminderOptionToMinutes[reminderOption],
          tag_ids: selectedTagIds,
        }),
      });

      const payload = (await response.json()) as { success: boolean; data?: Todo; error?: string };
      if (!response.ok || !payload.success || !payload.data) {
        setTodos((current) => current.filter((item) => item.id !== optimisticTodo.id));
        setMessage(payload.error || "Failed to create todo");
        return;
      }

      setTodos((current) =>
        sortByPriorityAndDate(current.map((item) => (item.id === optimisticTodo.id ? payload.data || item : item))),
      );
      resetCreateForm();
      setMessage(null);
    } catch {
      setTodos((current) => current.filter((item) => item.id !== optimisticTodo.id));
      setMessage("Failed to create todo");
    }
  };

  const updateTodo = async (todoId: string, patch: Partial<Todo> & { tag_ids?: string[] }) => {
    const previous = todos;

    setTodos((current) =>
      sortByPriorityAndDate(
        current.map((item) =>
          item.id === todoId
            ? {
                ...item,
                ...patch,
                tags: patch.tag_ids ? tags.filter((tag) => patch.tag_ids?.includes(tag.id)) : item.tags,
              }
            : item,
        ),
      ),
    );

    try {
      const response = await fetch(`/api/todos/${todoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      const payload = (await response.json()) as { success: boolean; data?: Todo; error?: string };
      if (!response.ok || !payload.success || !payload.data) {
        setTodos(previous);
        setMessage(payload.error || "Failed to update todo");
        return;
      }

      setTodos((current) => sortByPriorityAndDate(current.map((item) => (item.id === todoId ? payload.data || item : item))));
    } catch {
      setTodos(previous);
      setMessage("Failed to update todo");
    }
  };

  const deleteTodo = async (todoId: string) => {
    const shouldDelete = window.confirm("Delete this todo?");
    if (!shouldDelete) {
      return;
    }

    const previous = todos;
    setTodos((current) => current.filter((item) => item.id !== todoId));

    try {
      const response = await fetch(`/api/todos/${todoId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setTodos(previous);
        setMessage("Failed to delete todo");
      }
    } catch {
      setTodos(previous);
      setMessage("Failed to delete todo");
    }
  };

  const addSubtask = async (todoId: string) => {
    const raw = (subtaskDrafts[todoId] || "").trim();
    if (!raw) {
      return;
    }

    const response = await fetch(`/api/todos/${todoId}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: raw }),
    });

    if (!response.ok) {
      setMessage("Failed to add subtask");
      return;
    }

    const payload = (await response.json()) as { success: boolean; data?: Subtask };
    if (!payload.success || !payload.data) {
      setMessage("Failed to add subtask");
      return;
    }

    setTodos((current) =>
      current.map((item) => (item.id === todoId ? { ...item, subtasks: [...item.subtasks, payload.data as Subtask] } : item)),
    );

    setSubtaskDrafts((current) => ({
      ...current,
      [todoId]: "",
    }));
  };

  const updateSubtask = async (todoId: string, subtaskId: string, patch: Partial<Subtask>) => {
    const response = await fetch(`/api/subtasks/${subtaskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    if (!response.ok) {
      setMessage("Failed to update subtask");
      return;
    }

    const payload = (await response.json()) as { success: boolean; data?: Subtask };
    if (!payload.success || !payload.data) {
      setMessage("Failed to update subtask");
      return;
    }

    setTodos((current) =>
      current.map((item) =>
        item.id === todoId
          ? {
              ...item,
              subtasks: item.subtasks
                .map((subtask) => (subtask.id === subtaskId ? (payload.data as Subtask) : subtask))
                .sort((left, right) => left.position - right.position),
            }
          : item,
      ),
    );
  };

  const deleteSubtask = async (todoId: string, subtaskId: string) => {
    const response = await fetch(`/api/subtasks/${subtaskId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setMessage("Failed to delete subtask");
      return;
    }

    setTodos((current) =>
      current.map((item) =>
        item.id === todoId
          ? {
              ...item,
              subtasks: item.subtasks.filter((subtask) => subtask.id !== subtaskId),
            }
          : item,
      ),
    );
  };

  const createTag = async () => {
    const name = newTagName.trim();
    if (!name) {
      setMessage("Tag name is required");
      return;
    }

    const response = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        color: newTagColor,
      }),
    });

    const payload = (await response.json()) as { success: boolean; data?: Tag; error?: string };
    if (!response.ok || !payload.success || !payload.data) {
      setMessage(payload.error || "Failed to create tag");
      return;
    }

    setTags((current) => [...current, payload.data as Tag].sort((left, right) => left.name.localeCompare(right.name)));
    setNewTagName("");
    setNewTagColor("#3B82F6");
  };

  const updateTag = async (tag: Tag) => {
    const nextName = window.prompt("Edit tag name", tag.name)?.trim();
    if (!nextName) {
      return;
    }

    const nextColor = window.prompt("Edit hex color", tag.color)?.trim() || tag.color;

    const response = await fetch(`/api/tags/${tag.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nextName,
        color: nextColor,
      }),
    });

    if (!response.ok) {
      setMessage("Failed to update tag");
      return;
    }

    const payload = (await response.json()) as { success: boolean; data?: Tag };
    if (!payload.success || !payload.data) {
      setMessage("Failed to update tag");
      return;
    }

    setTags((current) => current.map((item) => (item.id === tag.id ? (payload.data as Tag) : item)));
    setTodos((current) =>
      current.map((todo) => ({
        ...todo,
        tags: todo.tags.map((item) => (item.id === tag.id ? (payload.data as Tag) : item)),
      })),
    );
  };

  const deleteTag = async (tagId: string) => {
    if (!window.confirm("Delete this tag?")) {
      return;
    }

    const response = await fetch(`/api/tags/${tagId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setMessage("Failed to delete tag");
      return;
    }

    setTags((current) => current.filter((item) => item.id !== tagId));
    setTodos((current) => current.map((todo) => ({ ...todo, tags: todo.tags.filter((tag) => tag.id !== tagId) })));
    setSelectedTagIds((current) => current.filter((item) => item !== tagId));
  };

  const saveTemplateFromCurrentForm = async () => {
    const name = window.prompt("Template name");
    if (!name?.trim()) {
      return;
    }

    const descriptionText = window.prompt("Template description (optional)") || null;
    const category = window.prompt("Template category (optional)") || null;

    const response = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: descriptionText,
        category,
        title: title.trim() || "Untitled template",
        priority,
        recurrence_pattern: recurrence === "none" ? null : recurrence,
        reminder_minutes: reminderOptionToMinutes[reminderOption],
        due_date_offset_minutes: dueDateLocal ? Math.max(1, Math.round((new Date(dueDateLocal).getTime() - Date.now()) / 60000)) : null,
        subtasks: [],
      }),
    });

    if (!response.ok) {
      setMessage("Failed to save template");
      return;
    }

    const payload = (await response.json()) as { success: boolean; data?: Template };
    if (!payload.success || !payload.data) {
      setMessage("Failed to save template");
      return;
    }

    setTemplates((current) => [payload.data as Template, ...current]);
    setMessage("Template saved");
  };

  const saveTemplateFromTodo = async (todo: Todo) => {
    const name = window.prompt("Template name", todo.title);
    if (!name?.trim()) {
      return;
    }

    const category = window.prompt("Template category (optional)") || null;

    const response = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: todo.description,
        category,
        title: todo.title,
        priority: todo.priority,
        recurrence_pattern: todo.recurrence_pattern,
        reminder_minutes: todo.reminder_minutes,
        due_date_offset_minutes: todo.due_date ? Math.max(1, Math.round((new Date(todo.due_date).getTime() - Date.now()) / 60000)) : null,
        subtasks: todo.subtasks.map((subtask) => ({
          title: subtask.title,
          position: subtask.position,
        })),
      }),
    });

    if (!response.ok) {
      setMessage("Failed to save template");
      return;
    }

    const payload = (await response.json()) as { success: boolean; data?: Template };
    if (!payload.success || !payload.data) {
      setMessage("Failed to save template");
      return;
    }

    setTemplates((current) => [payload.data as Template, ...current]);
  };

  const useTemplate = async (templateId: string) => {
    const response = await fetch(`/api/templates/${templateId}/use`, {
      method: "POST",
    });

    if (!response.ok) {
      setMessage("Failed to use template");
      return;
    }

    const payload = (await response.json()) as { success: boolean; data?: Todo };
    if (!payload.success || !payload.data) {
      setMessage("Failed to use template");
      return;
    }

    setTodos((current) => sortByPriorityAndDate([payload.data as Todo, ...current]));
    setShowTemplateModal(false);
  };

  const deleteTemplate = async (templateId: string) => {
    const response = await fetch(`/api/templates/${templateId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setMessage("Failed to delete template");
      return;
    }

    setTemplates((current) => current.filter((item) => item.id !== templateId));
  };

  const exportData = async () => {
    const response = await fetch("/api/todos/export");
    if (!response.ok) {
      setMessage("Failed to export data");
      return;
    }

    const payload = await response.json();
    const blob = new Blob([JSON.stringify(payload.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `todos-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();

    URL.revokeObjectURL(url);
  };

  const triggerImport = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      const response = await fetch("/api/todos/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });

      const payload = (await response.json()) as { success: boolean; error?: string };
      if (!response.ok || !payload.success) {
        setMessage(payload.error || "Import failed");
        return;
      }

      await loadAll();
      setMessage("Import successful");
    } catch {
      setMessage("Invalid JSON file");
    } finally {
      event.currentTarget.value = "";
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
    });
    window.location.href = "/login";
  };

  const enableNotifications = async () => {
    const granted = await requestPermission();
    if (!granted) {
      setMessage("Notification permission denied");
    }
  };

  const filteredTodos = useMemo(() => {
    return sortByPriorityAndDate(
      todos.filter((todo) => {
        if (priorityFilter !== "all" && todo.priority !== priorityFilter) {
          return false;
        }

        if (tagFilter !== "all" && !todo.tags.some((tag) => tag.id === tagFilter)) {
          return false;
        }

        if (debouncedSearch) {
          const haystack = [
            todo.title,
            todo.description || "",
            ...todo.tags.map((tag) => tag.name),
            ...todo.subtasks.map((subtask) => subtask.title),
          ]
            .join(" ")
            .toLowerCase();

          if (!haystack.includes(debouncedSearch)) {
            return false;
          }
        }

        return true;
      }),
    );
  }, [todos, priorityFilter, tagFilter, debouncedSearch]);

  const grouped = useMemo(() => {
    return {
      overdue: filteredTodos.filter((todo) => dueState(todo) === "overdue"),
      active: filteredTodos.filter((todo) => dueState(todo) === "active"),
      completed: filteredTodos.filter((todo) => dueState(todo) === "completed"),
    };
  }, [filteredTodos]);

  const templateCategories = useMemo(() => {
    const values = new Set<string>();
    for (const template of templates) {
      if (template.category) {
        values.add(template.category);
      }
    }
    return ["all", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [templates]);

  const visibleTemplates = useMemo(() => {
    if (templateFilter === "all") {
      return templates;
    }
    return templates.filter((template) => template.category === templateFilter);
  }, [templates, templateFilter]);

  const openEditor = (todo: Todo) => {
    setEditingTodoId(todo.id);
    setEditTitle(todo.title);
    setEditDescription(todo.description || "");
    setEditPriority(todo.priority);
    setEditDueDate(isoToLocalDateTimeInput(todo.due_date));
    setEditRecurrence(todo.recurrence_pattern || "none");
    setEditReminderOption(reminderMinutesToOption(todo.reminder_minutes));
    setEditTagIds(todo.tags.map((tag) => tag.id));
  };

  const commitEdit = async () => {
    if (!editingTodoId) {
      return;
    }

    await updateTodo(editingTodoId, {
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      due_date: editDueDate ? localDateTimeInputToIso(editDueDate) : null,
      priority: editPriority,
      recurrence_pattern: editRecurrence === "none" ? null : editRecurrence,
      reminder_minutes: reminderOptionToMinutes[editReminderOption],
      tag_ids: editTagIds,
    });

    setEditingTodoId(null);
  };

  const toggleExpandedTodo = (todoId: string) => {
    setExpandedTodoIds((current) =>
      current.includes(todoId) ? current.filter((item) => item !== todoId) : [...current, todoId],
    );
  };

  return (
    <main className="container">
      <section className="card" style={{ padding: "1rem", marginTop: "0.75rem" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: "0 0 0.25rem" }}>Todo App</h1>
            <p className="muted" style={{ margin: 0 }}>
              Signed in as {username || "user"}
            </p>
          </div>
          <div className="row">
            <Link className="btn" href="/calendar">
              Calendar
            </Link>
            <button className="btn" onClick={() => setShowTemplateModal(true)}>
              Templates
            </button>
            <button className="btn" onClick={() => setShowTagModal(true)}>
              Manage Tags
            </button>
            <button className="btn" onClick={exportData}>
              Export
            </button>
            <button className="btn" onClick={triggerImport}>
              Import
            </button>
            <button className="btn" onClick={enableNotifications}>
              {notificationsEnabled ? "Notifications On" : "Enable Notifications"}
            </button>
            <button className="btn danger" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      </section>

      <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleImportFile} />

      <section className="card" style={{ padding: "1rem", marginTop: "0.75rem" }}>
        <h2 style={{ marginTop: 0 }}>Create Todo</h2>
        <div className="row">
          <label className="field" style={{ flex: 2, minWidth: 240 }}>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Task title" />
          </label>
          <label className="field" style={{ flex: 2, minWidth: 240 }}>
            Description
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional details"
            />
          </label>
          <label className="field">
            Priority
            <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="field">
            Due date
            <input
              type="datetime-local"
              value={dueDateLocal}
              onChange={(event) => setDueDateLocal(event.target.value)}
            />
          </label>
          <label className="field">
            Recurrence
            <select value={recurrence} onChange={(event) => setRecurrence(event.target.value as RecurrencePattern | "none")}>
              <option value="none">No repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          <label className="field">
            Reminder
            <select
              value={reminderOption}
              disabled={!dueDateLocal}
              onChange={(event) => setReminderOption(event.target.value as ReminderOption)}
            >
              <option value="none">None</option>
              <option value="15m">15 minutes</option>
              <option value="30m">30 minutes</option>
              <option value="1h">1 hour</option>
              <option value="2h">2 hours</option>
              <option value="1d">1 day</option>
              <option value="2d">2 days</option>
              <option value="1w">1 week</option>
            </select>
          </label>
        </div>

        {tags.length > 0 ? (
          <div style={{ marginTop: "0.75rem" }}>
            <span className="muted">Tags:</span>
            <div className="row" style={{ marginTop: "0.35rem" }}>
              {tags.map((tag) => {
                const selected = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    className="btn"
                    onClick={() =>
                      setSelectedTagIds((current) =>
                        current.includes(tag.id)
                          ? current.filter((item) => item !== tag.id)
                          : [...current, tag.id],
                      )
                    }
                    style={{
                      borderColor: tag.color,
                      background: selected ? tag.color : "#fff",
                      color: selected ? "#fff" : "#1c2430",
                    }}
                  >
                    {selected ? "✓ " : ""}
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="row" style={{ marginTop: "0.8rem" }}>
          <button className="btn primary" onClick={createTodo}>
            Add Todo
          </button>
          <button className="btn" disabled={!title.trim()} onClick={saveTemplateFromCurrentForm}>
            Save as Template
          </button>
        </div>
      </section>

      <section className="card" style={{ padding: "1rem", marginTop: "0.75rem" }}>
        <h2 style={{ marginTop: 0 }}>Search and Filters</h2>
        <div className="row">
          <label className="field" style={{ minWidth: 260, flex: 1 }}>
            Search
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search title, tags, or subtasks"
            />
          </label>
          <label className="field">
            Priority
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as Priority | "all")}> 
              <option value="all">All priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="field">
            Tag
            <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
              <option value="all">All tags</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: "0.65rem" }}>
          <span className="muted">
            Showing {filteredTodos.length} result{filteredTodos.length === 1 ? "" : "s"}
          </span>
          <button
            className="btn"
            onClick={() => {
              setSearchQuery("");
              setPriorityFilter("all");
              setTagFilter("all");
            }}
          >
            Clear filters
          </button>
        </div>
      </section>

      {message ? (
        <section className="card" style={{ padding: "0.65rem", marginTop: "0.75rem" }}>
          <p style={{ margin: 0 }}>{message}</p>
        </section>
      ) : null}

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <>
          {([
            ["Overdue", grouped.overdue],
            ["Active", grouped.active],
            ["Completed", grouped.completed],
          ] as Array<[string, Todo[]]>).map(([label, items]) => (
            <section key={label} style={{ marginTop: "0.75rem" }}>
              <h2 className="section-title">
                {label} ({items.length})
              </h2>
              {items.length === 0 ? (
                <section className="card" style={{ padding: "0.8rem" }}>
                  <p className="muted" style={{ margin: 0 }}>
                    No todos in this section.
                  </p>
                </section>
              ) : (
                <div className="todo-list">
                  {items.map((todo) => {
                    const todoProgress = progress(todo.subtasks);
                    const expanded = expandedTodoIds.includes(todo.id);
                    const editing = editingTodoId === todo.id;

                    return (
                      <article className="card todo-card" key={todo.id}>
                        {!editing ? (
                          <>
                            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "grid", gap: "0.35rem", flex: 1 }}>
                                <strong style={{ textDecoration: todo.completed ? "line-through" : "none" }}>{todo.title}</strong>
                                {todo.description ? <span className="muted">{todo.description}</span> : null}
                                <span className="muted">Due: {formatDueDate(todo.due_date)}</span>
                              </div>
                              <div className="row">
                                <button className="btn" onClick={() => void updateTodo(todo.id, { completed: !todo.completed })}>
                                  {todo.completed ? "Mark Active" : "Mark Complete"}
                                </button>
                                <button className="btn" onClick={() => openEditor(todo)}>
                                  Edit
                                </button>
                                <button className="btn" onClick={() => void saveTemplateFromTodo(todo)}>
                                  Save Template
                                </button>
                                <button className="btn danger" onClick={() => void deleteTodo(todo.id)}>
                                  Delete
                                </button>
                              </div>
                            </div>

                            <div className="row" style={{ marginTop: "0.45rem" }}>
                              <span className={`badge priority-${todo.priority}`}>{todo.priority}</span>
                              {todo.recurrence_pattern ? <span className="badge">🔄 {todo.recurrence_pattern}</span> : null}
                              {todo.reminder_minutes ? (
                                <span className="badge">🔔 {reminderMinutesToOption(todo.reminder_minutes)}</span>
                              ) : null}
                              {todo.tags.map((tag) => (
                                <button
                                  key={tag.id}
                                  className="badge"
                                  onClick={() => setTagFilter(tag.id)}
                                  style={{
                                    background: tag.color,
                                    color: "#fff",
                                    borderColor: tag.color,
                                  }}
                                >
                                  {tag.name}
                                </button>
                              ))}
                            </div>

                            <div style={{ marginTop: "0.5rem" }}>
                              <div className={`progress ${todoProgress.percentage === 100 ? "done" : ""}`}>
                                <span style={{ width: `${todoProgress.percentage}%` }} />
                              </div>
                              <small className="muted">
                                {todoProgress.completed}/{todoProgress.total} subtasks ({todoProgress.percentage}%)
                              </small>
                            </div>

                            <div style={{ marginTop: "0.55rem" }}>
                              <button className="btn" onClick={() => toggleExpandedTodo(todo.id)}>
                                {expanded ? "Hide Subtasks" : "Show Subtasks"}
                              </button>
                            </div>

                            {expanded ? (
                              <div style={{ marginTop: "0.55rem", display: "grid", gap: "0.4rem" }}>
                                {todo.subtasks.map((subtask) => (
                                  <div key={subtask.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                                    <label className="row" style={{ alignItems: "center", margin: 0 }}>
                                      <input
                                        type="checkbox"
                                        checked={subtask.completed}
                                        onChange={() => void updateSubtask(todo.id, subtask.id, { completed: !subtask.completed })}
                                      />
                                      <span style={{ textDecoration: subtask.completed ? "line-through" : "none" }}>
                                        {subtask.title}
                                      </span>
                                    </label>
                                    <button className="btn" onClick={() => void deleteSubtask(todo.id, subtask.id)}>
                                      Delete
                                    </button>
                                  </div>
                                ))}

                                <div className="row">
                                  <input
                                    style={{ flex: 1, minWidth: 180 }}
                                    value={subtaskDrafts[todo.id] || ""}
                                    onChange={(event) =>
                                      setSubtaskDrafts((current) => ({
                                        ...current,
                                        [todo.id]: event.target.value,
                                      }))
                                    }
                                    placeholder="New subtask"
                                  />
                                  <button className="btn" onClick={() => void addSubtask(todo.id)}>
                                    Add
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div style={{ display: "grid", gap: "0.5rem" }}>
                            <div className="row">
                              <label className="field" style={{ flex: 2 }}>
                                Title
                                <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
                              </label>
                              <label className="field" style={{ flex: 2 }}>
                                Description
                                <input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} />
                              </label>
                            </div>
                            <div className="row">
                              <label className="field">
                                Priority
                                <select value={editPriority} onChange={(event) => setEditPriority(event.target.value as Priority)}>
                                  <option value="high">High</option>
                                  <option value="medium">Medium</option>
                                  <option value="low">Low</option>
                                </select>
                              </label>
                              <label className="field">
                                Due date
                                <input
                                  type="datetime-local"
                                  value={editDueDate}
                                  onChange={(event) => setEditDueDate(event.target.value)}
                                />
                              </label>
                              <label className="field">
                                Recurrence
                                <select
                                  value={editRecurrence}
                                  onChange={(event) =>
                                    setEditRecurrence(event.target.value as RecurrencePattern | "none")
                                  }
                                >
                                  <option value="none">No repeat</option>
                                  <option value="daily">Daily</option>
                                  <option value="weekly">Weekly</option>
                                  <option value="monthly">Monthly</option>
                                  <option value="yearly">Yearly</option>
                                </select>
                              </label>
                              <label className="field">
                                Reminder
                                <select
                                  value={editReminderOption}
                                  disabled={!editDueDate}
                                  onChange={(event) => setEditReminderOption(event.target.value as ReminderOption)}
                                >
                                  <option value="none">None</option>
                                  <option value="15m">15 minutes</option>
                                  <option value="30m">30 minutes</option>
                                  <option value="1h">1 hour</option>
                                  <option value="2h">2 hours</option>
                                  <option value="1d">1 day</option>
                                  <option value="2d">2 days</option>
                                  <option value="1w">1 week</option>
                                </select>
                              </label>
                            </div>

                            <div className="row">
                              {tags.map((tag) => {
                                const selected = editTagIds.includes(tag.id);
                                return (
                                  <button
                                    key={tag.id}
                                    className="btn"
                                    onClick={() =>
                                      setEditTagIds((current) =>
                                        current.includes(tag.id)
                                          ? current.filter((item) => item !== tag.id)
                                          : [...current, tag.id],
                                      )
                                    }
                                    style={{
                                      borderColor: tag.color,
                                      background: selected ? tag.color : "#fff",
                                      color: selected ? "#fff" : "#1c2430",
                                    }}
                                  >
                                    {selected ? "✓ " : ""}
                                    {tag.name}
                                  </button>
                                );
                              })}
                            </div>

                            <div className="row">
                              <button className="btn primary" onClick={() => void commitEdit()}>
                                Save
                              </button>
                              <button className="btn" onClick={() => setEditingTodoId(null)}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </>
      )}

      {showTagModal ? (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Manage tags">
          <section className="card modal-content">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Manage Tags</h3>
              <button className="btn" onClick={() => setShowTagModal(false)}>
                Close
              </button>
            </div>

            <div className="row" style={{ marginTop: "0.7rem" }}>
              <label className="field" style={{ flex: 1 }}>
                Name
                <input value={newTagName} onChange={(event) => setNewTagName(event.target.value)} />
              </label>
              <label className="field">
                Color
                <input type="color" value={newTagColor} onChange={(event) => setNewTagColor(event.target.value)} />
              </label>
              <button className="btn primary" style={{ alignSelf: "end" }} onClick={() => void createTag()}>
                Create
              </button>
            </div>

            <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.45rem" }}>
              {tags.map((tag) => (
                <div key={tag.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <span className="badge" style={{ background: tag.color, color: "#fff", borderColor: tag.color }}>
                    {tag.name}
                  </span>
                  <div className="row">
                    <button className="btn" onClick={() => void updateTag(tag)}>
                      Edit
                    </button>
                    <button className="btn danger" onClick={() => void deleteTag(tag.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {showTemplateModal ? (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Templates">
          <section className="card modal-content">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Templates</h3>
              <button className="btn" onClick={() => setShowTemplateModal(false)}>
                Close
              </button>
            </div>

            <div className="row" style={{ marginTop: "0.7rem" }}>
              <label className="field">
                Category
                <select value={templateFilter} onChange={(event) => setTemplateFilter(event.target.value)}>
                  {templateCategories.map((value) => (
                    <option key={value} value={value}>
                      {value === "all" ? "All categories" : value}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.6rem" }}>
              {visibleTemplates.map((template) => (
                <article key={template.id} className="card" style={{ padding: "0.65rem" }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <strong>{template.name}</strong>
                      <p className="muted" style={{ margin: "0.2rem 0 0" }}>
                        {template.description || "No description"}
                      </p>
                    </div>
                    <div className="row">
                      <button className="btn success" onClick={() => void useTemplate(template.id)}>
                        Use
                      </button>
                      <button className="btn danger" onClick={() => void deleteTemplate(template.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="row" style={{ marginTop: "0.35rem" }}>
                    <span className={`badge priority-${template.priority}`}>{template.priority}</span>
                    {template.category ? <span className="badge">{template.category}</span> : null}
                    {template.recurrence_pattern ? <span className="badge">🔄 {template.recurrence_pattern}</span> : null}
                    {template.reminder_minutes ? (
                      <span className="badge">🔔 {reminderMinutesToOption(template.reminder_minutes)}</span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
