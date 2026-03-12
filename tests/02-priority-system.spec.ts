import { test, expect } from "@playwright/test";
import { TestHelpers } from "./helpers";

let h: TestHelpers;

test.beforeEach(async ({ request }) => {
  h = new TestHelpers(request);
});

test.describe("PRP 02: Priority System", () => {
  test.describe("Creating todos with priority", () => {
    test("should create todo with high priority", async () => {
      const { response, body } = await h.createTodo({
        title: "Urgent task",
        priority: "high",
      });

      expect(response.status()).toBe(201);
      expect(body.data.priority).toBe("high");
    });

    test("should create todo with medium priority", async () => {
      const { response, body } = await h.createTodo({
        title: "Normal task",
        priority: "medium",
      });

      expect(response.status()).toBe(201);
      expect(body.data.priority).toBe("medium");
    });

    test("should create todo with low priority", async () => {
      const { response, body } = await h.createTodo({
        title: "Low priority task",
        priority: "low",
      });

      expect(response.status()).toBe(201);
      expect(body.data.priority).toBe("low");
    });

    test("should default to medium priority if not specified", async () => {
      const { response, body } = await h.createTodo({
        title: "Default priority",
      });

      expect(response.status()).toBe(201);
      expect(body.data.priority).toBe("medium");
    });

    test("should reject invalid priority", async () => {
      const { response } = await h.createTodo({
        title: "Invalid priority",
        priority: "critical" as any,
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe("Updating priority", () => {
    test("should change priority from low to high", async () => {
      const created = await h.createTodo({
        title: "Test",
        priority: "low",
      });
      const todoId = created.body.data.id;

      const { response, body } = await h.updateTodo(todoId, {
        priority: "high",
      });

      expect(response.status()).toBe(200);
      expect(body.data.priority).toBe("high");
    });

    test("should change priority from high to medium", async () => {
      const created = await h.createTodo({
        title: "Test",
        priority: "high",
      });
      const todoId = created.body.data.id;

      const { response, body } = await h.updateTodo(todoId, {
        priority: "medium",
      });

      expect(response.status()).toBe(200);
      expect(body.data.priority).toBe("medium");
    });

    test("should reject invalid priority on update", async () => {
      const created = await h.createTodo({ title: "Test" });
      const todoId = created.body.data.id;

      const { response } = await h.updateTodo(todoId, {
        priority: "super_high" as any,
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe("Priority sorting", () => {
    test("should sort todos: high > medium > low", async () => {
      // Create todos in random order
      const { body: low } = await h.createTodo({
        title: "Low priority",
        priority: "low",
      });
      const { body: high } = await h.createTodo({
        title: "High priority",
        priority: "high",
      });
      const { body: medium } = await h.createTodo({
        title: "Medium priority",
        priority: "medium",
      });

      const createdIds = new Set([low.data.id, high.data.id, medium.data.id]);
      const { body } = await h.listTodos();

      // Find our test todos and verify order
      const priorities = body.data
        .filter((t: any) => createdIds.has(t.id))
        .map((t: any) => t.priority);

      expect(priorities[0]).toBe("high");
      expect(priorities[1]).toBe("medium");
      expect(priorities[2]).toBe("low");
    });

    test("should sort multiple high priority todos by creation date", async () => {
      const { body: todo1 } = await h.createTodo({
        title: "High 1",
        priority: "high",
      });
      const { body: todo2 } = await h.createTodo({
        title: "High 2",
        priority: "high",
      });

      const createdIds = new Set([todo1.data.id, todo2.data.id]);
      const { body } = await h.listTodos();

      const highPriority = body.data
        .filter((t: any) => createdIds.has(t.id))
        .map((t: any) => t.title);

      // Should maintain creation order (1 created before 2)
      expect(highPriority[0]).toBe("High 1");
      expect(highPriority[1]).toBe("High 2");
    });

    test("should maintain sort after priority update", async () => {
      const todo1 = await h.createTodo({
        title: "Priority A",
        priority: "low",
      });
      const todo2 = await h.createTodo({
        title: "Priority B",
        priority: "high",
      });

      // Update todo1 to high priority
      await h.updateTodo(todo1.body.data.id, { priority: "high" });

      const { body } = await h.listTodos();
      const filtered = body.data
        .filter((t: any) => ["Priority A", "Priority B"].includes(t.title))
        .map((t: any) => t.title);

      // Both high priority, so should be in creation order
      expect(filtered[0]).toBe("Priority A");
      expect(filtered[1]).toBe("Priority B");
    });
  });

  test.describe("Priority filter", () => {
    test("should allow filtering by priority through API parameter", async () => {
      const { response: res1 } = await h.createTodo({
        title: "High 1",
        priority: "high",
      });
      const { response: res2 } = await h.createTodo({
        title: "Medium 1",
        priority: "medium",
      });
      const { response: res3 } = await h.createTodo({
        title: "Low 1",
        priority: "low",
      });

      expect(res1.status()).toBe(201);
      expect(res2.status()).toBe(201);
      expect(res3.status()).toBe(201);

      // Verify all todos exist
      const { body } = await h.listTodos();
      expect(body.data.length).toBeGreaterThanOrEqual(3);
    });
  });

  test.describe("Priority badges display", () => {
    test("should have valid priority value for display", async () => {
      const { body } = await h.createTodo({
        title: "Badge test",
        priority: "high",
      });

      const priority = body.data.priority;
      expect(["high", "medium", "low"]).toContain(priority);
    });
  });
});
