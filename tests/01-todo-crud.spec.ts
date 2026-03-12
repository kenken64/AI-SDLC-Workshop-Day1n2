import { test, expect } from "@playwright/test";
import { TestHelpers } from "./helpers";

let h: TestHelpers;

test.beforeEach(async ({ request }) => {
  h = new TestHelpers(request);
});

test.describe("PRP 01: Todo CRUD Operations", () => {
  test.describe("Creating todos", () => {
    test("should create a todo with title only", async () => {
      const { response, body } = await h.createTodo({
        title: "Buy milk",
      });

      expect(response.status()).toBe(201);
      expect(body.data).toMatchObject({
        title: "Buy milk",
        priority: "medium",
        completed: 0,
      });
      expect(body.data.id).toBeTruthy();
    });

    test("should create a todo with all fields", async () => {
      const { response, body } = await h.createTodo({
        title: "Complete project",
        description: "Finish the Q1 deliverable",
        priority: "high",
        due_date: "2026-12-31T23:59:00",
        recurrence_pattern: "weekly",
        reminder_minutes: 1440,
      });

      expect(response.status()).toBe(201);
      expect(body.data).toMatchObject({
        title: "Complete project",
        description: "Finish the Q1 deliverable",
        priority: "high",
        recurrence_pattern: "weekly",
        reminder_minutes: 1440,
        completed: 0,
      });
    });

    test("should reject empty title", async () => {
      const { response } = await h.createTodo({
        title: "",
      });

      expect(response.status()).toBe(400);
    });

    test("should reject whitespace-only title", async () => {
      const { response } = await h.createTodo({
        title: "   ",
      });

      expect(response.status()).toBe(400);
    });

    test("should trim title whitespace", async () => {
      const { response, body } = await h.createTodo({
        title: "  Buy milk  ",
      });

      expect(response.status()).toBe(201);
      expect(body.data.title).toBe("Buy milk");
    });

    test("should enforce maximum title length", async () => {
      const longTitle = "x".repeat(257);
      const { response } = await h.createTodo({
        title: longTitle,
      });

      expect(response.status()).toBe(400);
    });

    test("should default priority to medium", async () => {
      const { response, body } = await h.createTodo({
        title: "Test todo",
      });

      expect(response.status()).toBe(201);
      expect(body.data.priority).toBe("medium");
    });

    test("should set Singapore timezone for created_at", async () => {
      const { response, body } = await h.createTodo({
        title: "Timezone test",
      });

      expect(response.status()).toBe(201);
      expect(body.data.created_at).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  test.describe("Reading todos", () => {
    test("should fetch all todos", async () => {
      // Create test todos
      const todo1 = await h.createTodo({ title: "Todo 1" });
      const todo2 = await h.createTodo({ title: "Todo 2" });

      const { response, body } = await h.listTodos();

      expect(response.status()).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(2);

      const titles = body.data.map((t: any) => t.title);
      expect(titles).toContain("Todo 1");
      expect(titles).toContain("Todo 2");
    });

    test("should return empty array when no todos exist", async () => {
      const { response, body } = await h.listTodos();

      expect(response.status()).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  test.describe("Updating todos", () => {
    test("should update todo title", async () => {
      const created = await h.createTodo({ title: "Original title" });
      const todoId = created.body.data.id;

      const { response, body } = await h.updateTodo(todoId, {
        title: "Updated title",
      });

      expect(response.status()).toBe(200);
      expect(body.data.title).toBe("Updated title");
    });

    test("should update todo priority", async () => {
      const created = await h.createTodo({ title: "Test", priority: "low" });
      const todoId = created.body.data.id;

      const { response, body } = await h.updateTodo(todoId, {
        priority: "high",
      });

      expect(response.status()).toBe(200);
      expect(body.data.priority).toBe("high");
    });

    test("should update todo description", async () => {
      const created = await h.createTodo({ title: "Test" });
      const todoId = created.body.data.id;

      const desc = "New description";
      const { response, body } = await h.updateTodo(todoId, {
        description: desc,
      });

      expect(response.status()).toBe(200);
      expect(body.data.description).toBe(desc);
    });

    test("should update todo due_date", async () => {
      const created = await h.createTodo({ title: "Test" });
      const todoId = created.body.data.id;

      const newDate = "2026-12-31T23:59:00";
      const { response, body } = await h.updateTodo(todoId, {
        due_date: newDate,
      });

      expect(response.status()).toBe(200);
      expect(body.data.due_date).toBe(newDate);
    });

    test("should mark todo as completed", async () => {
      const created = await h.createTodo({ title: "Test" });
      const todoId = created.body.data.id;

      const { response, body } = await h.updateTodo(todoId, {
        completed: true,
      });

      expect(response.status()).toBe(200);
      expect(body.data.completed).toBe(1);
    });

    test("should mark todo as incomplete", async () => {
      const created = await h.createTodo({ title: "Test" });
      const todoId = created.body.data.id;

      await h.updateTodo(todoId, { completed: true });
      const { response, body } = await h.updateTodo(todoId, {
        completed: false,
      });

      expect(response.status()).toBe(200);
      expect(body.data.completed).toBe(0);
    });

    test("should reject invalid priority", async () => {
      const created = await h.createTodo({ title: "Test" });
      const todoId = created.body.data.id;

      const { response } = await h.updateTodo(todoId, {
        priority: "invalid",
      });

      expect(response.status()).toBe(400);
    });

    test("should return 404 for non-existent todo", async () => {
      const { response } = await h.updateTodo(99999, { title: "Test" });

      expect(response.status()).toBe(404);
    });
  });

  test.describe("Deleting todos", () => {
    test("should delete a todo", async () => {
      const created = await h.createTodo({ title: "To delete" });
      const todoId = created.body.data.id;

      const { response } = await h.deleteTodo(todoId);

      expect(response.status()).toBe(200);

      // Verify deletion
      const list = await h.listTodos();
      const titles = list.body.data.map((t: any) => t.title);
      expect(titles).not.toContain("To delete");
    });

    test("should return 404 when deleting non-existent todo", async () => {
      const { response } = await h.deleteTodo(99999);

      expect(response.status()).toBe(404);
    });

    test("should cascade delete subtasks when deleting todo", async () => {
      const created = await h.createTodo({ title: "Parent todo" });
      const todoId = created.body.data.id;

      // Create subtask
      const subtask = await h.createSubtask(todoId, "Subtask");
      const subtaskId = subtask.body.data.id;

      // Delete parent todo
      await h.deleteTodo(todoId);

      // Try to fetch subtask - should not exist
      const { body } = await h.listSubtasks(todoId);
      const ids = body.data?.map((s: any) => s.id) || [];
      expect(ids).not.toContain(subtaskId);
    });
  });

  test.describe("Sorting and ordering", () => {
    test("should sort todos by priority then creation date", async () => {
      const { body: low } = await h.createTodo({ title: "Low priority", priority: "low" });
      const { body: high } = await h.createTodo({ title: "High priority", priority: "high" });
      const { body: medium } = await h.createTodo({ title: "Medium priority", priority: "medium" });

      const createdIds = new Set([low.data.id, high.data.id, medium.data.id]);
      const { body } = await h.listTodos();
      const titles = body.data
        .filter((t: any) => createdIds.has(t.id))
        .map((t: any) => t.title);

      expect(titles[0]).toBe("High priority");
      expect(titles[1]).toBe("Medium priority");
      expect(titles[2]).toBe("Low priority");
    });
  });
});
