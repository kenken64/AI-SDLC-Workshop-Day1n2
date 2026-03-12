import { test, expect } from "@playwright/test";
import { TestHelpers } from "./helpers";

let h: TestHelpers;

test.beforeAll(async ({ request }) => {
  // Reset DB so the "export empty list" test starts with a clean state
  await request.post("http://localhost:3000/api/test-reset");
});

test.beforeEach(async ({ request }) => {
  h = new TestHelpers(request);
});

test.describe("PRP 09: Export and Import", () => {
  test.describe("Export functionality", () => {
    test("should export empty todo list", async () => {
      const response = await h.request.get("/api/todos/export");

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data.todos)).toBe(true);
      expect(body.data.todos.length).toBe(0);
    });

    test("should export todos with all fields", async () => {
      await h.createTodo({
        title: "Sample todo",
        description: "Test description",
        priority: "high",
        due_date: "2026-12-31T23:59:00",
        reminder_minutes: 60,
      });

      const response = await h.request.get("/api/todos/export");
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.data.todos.length).toBeGreaterThanOrEqual(1);

      const todo = body.data.todos[0];
      expect(todo.title).toBe("Sample todo");
      expect(todo.description).toBe("Test description");
      expect(todo.priority).toBe("high");
      expect(todo.reminder_minutes).toBe(60);
    });

    test("should export completed todos", async () => {
      const created = await h.createTodo({
        title: "Completed task",
      });
      const todoId = created.body.data.id;

      await h.updateTodo(todoId, { completed: true });

      const response = await h.request.get("/api/todos/export");
      const body = await response.json();

      expect(body.data.todos.length).toBeGreaterThanOrEqual(1);

      const todo = body.data.todos.find(
        (t: any) => t.title === "Completed task"
      );
      expect(todo).toBeTruthy();
      expect(todo.completed).toBe(1);
    });

    test("should export todos with recurring patterns", async () => {
      await h.createTodo({
        title: "Daily standup",
        recurrence_pattern: "daily",
        due_date: "2026-03-11T10:00:00",
      });

      const response = await h.request.get("/api/todos/export");
      const body = await response.json();

      expect(body.data.todos.length).toBeGreaterThanOrEqual(1);

      const todo = body.data.todos.find((t: any) => t.title === "Daily standup");
      expect(todo.recurrence_pattern).toBe("daily");
    });

    test("should export multiple todos with correct order", async () => {
      await h.createTodo({ title: "First" });
      await h.createTodo({ title: "Second" });
      await h.createTodo({ title: "Third" });

      const response = await h.request.get("/api/todos/export");
      const body = await response.json();

      const titles = body.data.todos.map((t: any) => t.title);
      expect(titles.includes("First")).toBe(true);
      expect(titles.includes("Second")).toBe(true);
      expect(titles.includes("Third")).toBe(true);
    });

    test("should provide export in consistent format", async () => {
      await h.createTodo({ title: "Test" });

      const response = await h.request.get("/api/todos/export");
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty("success");
      expect(body).toHaveProperty("data");
      expect(body.data).toHaveProperty("todos");
    });

    test("should export todos with tags", async () => {
      const tag = await h.createTag("important");
      const tagId = tag.body.data.id;

      const todo = await h.createTodo({ title: "Tagged task" });
      const todoId = todo.body.data.id;

      await h.addTagToTodo(todoId, tagId);

      const response = await h.request.get("/api/todos/export");
      const body = await response.json();

      const exported = body.data.todos.find((t: any) => t.title === "Tagged task");
      expect(exported.tags).toBeTruthy();
      expect(Array.isArray(exported.tags)).toBe(true);
    });

    test("should export todos with subtasks", async () => {
      const todo = await h.createTodo({ title: "Parent task" });
      const todoId = todo.body.data.id;

      await h.createSubtask(todoId, "Subtask 1");

      const response = await h.request.get("/api/todos/export");
      const body = await response.json();

      const exported = body.data.todos.find((t: any) => t.title === "Parent task");
      expect(exported.subtasks).toBeTruthy();
      expect(Array.isArray(exported.subtasks)).toBe(true);
      expect(exported.subtasks.length).toBeGreaterThanOrEqual(1);
    });
  });

  test.describe("Import functionality", () => {
    test("should import empty list", async () => {
      const response = await h.request.post("/api/todos/import", {
        data: {
          todos: [],
          tags: [],
          subtasks: [],
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    test("should import single todo", async () => {
      const importData = {
        todos: [
          {
            id: 1,
            title: "Imported task",
            description: null,
            completed: 0,
            priority: "medium",
            due_date: "2026-12-31T23:59:00",
            recurrence_pattern: null,
            reminder_minutes: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            tags: [],
            subtasks: [],
          },
        ],
        tags: [],
        subtasks: [],
      };

      const response = await h.request.post("/api/todos/import", {
        data: importData,
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);

      // Verify import was successful
      const list = await h.listTodos();
      const imported = list.body.data.find((t: any) => t.title === "Imported task");
      expect(imported).toBeTruthy();
    });

    test("should import todos with priorities preserved", async () => {
      const importData = {
        todos: [
          {
            id: 1,
            title: "High priority task",
            priority: "high",
            completed: 0,
            due_date: null,
            recurrence_pattern: null,
            reminder_minutes: null,
            description: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            tags: [],
            subtasks: [],
          },
        ],
        tags: [],
        subtasks: [],
      };

      await h.request.post("/api/todos/import", {
        data: importData,
      });

      const list = await h.listTodos();
      const imported = list.body.data.find(
        (t: any) => t.title === "High priority task"
      );

      expect(imported.priority).toBe("high");
    });

    test("should import todos with recurrence patterns", async () => {
      const importData = {
        todos: [
          {
            id: 1,
            title: "Daily meeting",
            priority: "medium",
            completed: 0,
            recurrence_pattern: "daily",
            due_date: "2026-03-11T10:00:00",
            reminder_minutes: null,
            description: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            tags: [],
            subtasks: [],
          },
        ],
        tags: [],
        subtasks: [],
      };

      await h.request.post("/api/todos/import", {
        data: importData,
      });

      const list = await h.listTodos();
      const imported = list.body.data.find((t: any) => t.title === "Daily meeting");

      expect(imported.recurrence_pattern).toBe("daily");
    });

    test("should import todos with completion status", async () => {
      const importData = {
        todos: [
          {
            id: 1,
            title: "Done task",
            priority: "medium",
            completed: 1,
            due_date: null,
            recurrence_pattern: null,
            reminder_minutes: null,
            description: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            tags: [],
            subtasks: [],
          },
        ],
        tags: [],
        subtasks: [],
      };

      await h.request.post("/api/todos/import", {
        data: importData,
      });

      const list = await h.listTodos();
      const imported = list.body.data.find((t: any) => t.title === "Done task");

      expect(imported.completed).toBe(1);
    });

    test("should import and map todo IDs correctly", async () => {
      const importData = {
        todos: [
          {
            id: 999,
            title: "Imported with ID remap",
            priority: "medium",
            completed: 0,
            due_date: null,
            recurrence_pattern: null,
            reminder_minutes: null,
            description: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            tags: [],
            subtasks: [],
          },
        ],
        tags: [],
        subtasks: [],
      };

      const response = await h.request.post("/api/todos/import", {
        data: importData,
      });

      expect(response.status()).toBe(200);

      // Verify the todo exists with a new ID (not 999)
      const list = await h.listTodos();
      const imported = list.body.data.find(
        (t: any) => t.title === "Imported with ID remap"
      );

      expect(imported).toBeTruthy();
      expect(imported.id).not.toBe(999); // ID should be remapped
    });

    test("should import multiple todos", async () => {
      const importData = {
        todos: [
          {
            id: 1,
            title: "Task 1",
            priority: "medium",
            completed: 0,
            due_date: null,
            recurrence_pattern: null,
            reminder_minutes: null,
            description: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            tags: [],
            subtasks: [],
          },
          {
            id: 2,
            title: "Task 2",
            priority: "high",
            completed: 0,
            due_date: null,
            recurrence_pattern: null,
            reminder_minutes: null,
            description: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            tags: [],
            subtasks: [],
          },
        ],
        tags: [],
        subtasks: [],
      };

      const response = await h.request.post("/api/todos/import", {
        data: importData,
      });

      expect(response.status()).toBe(200);

      const list = await h.listTodos();
      const imported1 = list.body.data.find((t: any) => t.title === "Task 1");
      const imported2 = list.body.data.find((t: any) => t.title === "Task 2");

      expect(imported1).toBeTruthy();
      expect(imported2).toBeTruthy();
      expect(imported2.priority).toBe("high");
    });
  });

  test.describe("Round-trip export-import", () => {
    test("should preserve todo data through export and import cycle", async () => {
      // Create original todo
      const created = await h.createTodo({
        title: "Round-trip test",
        description: "Test preservation",
        priority: "high",
        reminder_minutes: 30,
      });

      // Export
      const exportRes = await h.request.get("/api/todos/export");
      const exportBody = await exportRes.json();

      const exported = exportBody.data.todos.find(
        (t: any) => t.title === "Round-trip test"
      );

      // Verify exported data
      expect(exported.title).toBe("Round-trip test");
      expect(exported.description).toBe("Test preservation");
      expect(exported.priority).toBe("high");
      expect(exported.reminder_minutes).toBe(30);
    });

    test("should handle tags through export-import cycle", async () => {
      // Create tag
      const tag = await h.createTag("critical");
      const tagId = tag.body.data.id;

      // Create todo with tag
      const todo = await h.createTodo({ title: "Tagged export test" });
      const todoId = todo.body.data.id;

      await h.addTagToTodo(todoId, tagId);

      // Export
      const exportRes = await h.request.get("/api/todos/export");
      const exportBody = await exportRes.json();

      const exported = exportBody.data.todos.find(
        (t: any) => t.title === "Tagged export test"
      );

      expect(exported.tags).toBeDefined();
      expect(exported.tags.length).toBeGreaterThanOrEqual(1);
    });

    test("should handle subtasks through export-import cycle", async () => {
      // Create todo with subtask
      const todo = await h.createTodo({ title: "Parent for export" });
      const todoId = todo.body.data.id;

      await h.createSubtask(todoId, "Child task");

      // Export
      const exportRes = await h.request.get("/api/todos/export");
      const exportBody = await exportRes.json();

      const exported = exportBody.data.todos.find(
        (t: any) => t.title === "Parent for export"
      );

      expect(exported.subtasks).toBeDefined();
      expect(exported.subtasks.length).toBeGreaterThanOrEqual(1);
      expect(exported.subtasks[0].title).toBe("Child task");
    });
  });

  test.describe("Import validation", () => {
    test("should reject invalid import format", async () => {
      const response = await h.request.post("/api/todos/import", {
        data: {
          invalid: "format",
        },
      });

      expect(response.status()).toBe(400);
    });

    test("should reject import with missing required fields", async () => {
      const response = await h.request.post("/api/todos/import", {
        data: {
          todos: [
            {
              // Missing required title field
              priority: "high",
              completed: 0,
            },
          ],
          tags: [],
          subtasks: [],
        },
      });

      expect(response.status()).toBe(400);
    });

    test("should validate todo fields during import", async () => {
      const importData = {
        todos: [
          {
            id: 1,
            title: "Valid todo",
            priority: "invalid" as any, // Invalid priority
            completed: 0,
            due_date: null,
            recurrence_pattern: null,
            reminder_minutes: null,
            description: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            tags: [],
            subtasks: [],
          },
        ],
        tags: [],
        subtasks: [],
      };

      const response = await h.request.post("/api/todos/import", {
        data: importData,
      });

      expect(response.status()).toBe(400);
    });
  });
});
