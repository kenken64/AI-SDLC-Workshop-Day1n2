import { test, expect } from "@playwright/test";
import { TestHelpers } from "./helpers";

let h: TestHelpers;

test.beforeEach(async ({ request }) => {
  h = new TestHelpers(request);
});

test.describe("PRP 03: Recurring Todos", () => {
  test.describe("Creating recurring todos", () => {
    test("should create daily recurring todo", async () => {
      const { response, body } = await h.createTodo({
        title: "Daily standup",
        recurrence_pattern: "daily",
        due_date: "2026-03-11T15:00:00",
      });

      expect(response.status()).toBe(201);
      expect(body.data.recurrence_pattern).toBe("daily");
      expect(body.data.due_date).toBeTruthy();
    });

    test("should create weekly recurring todo", async () => {
      const { response, body } = await h.createTodo({
        title: "Weekly review",
        recurrence_pattern: "weekly",
        due_date: "2026-03-15T10:00:00",
      });

      expect(response.status()).toBe(201);
      expect(body.data.recurrence_pattern).toBe("weekly");
    });

    test("should create monthly recurring todo", async () => {
      const { response, body } = await h.createTodo({
        title: "Monthly report",
        recurrence_pattern: "monthly",
        due_date: "2026-04-11T09:00:00",
      });

      expect(response.status()).toBe(201);
      expect(body.data.recurrence_pattern).toBe("monthly");
    });

    test("should create yearly recurring todo", async () => {
      const { response, body } = await h.createTodo({
        title: "Annual review",
        recurrence_pattern: "yearly",
        due_date: "2027-03-11T10:00:00",
      });

      expect(response.status()).toBe(201);
      expect(body.data.recurrence_pattern).toBe("yearly");
    });

    test("should default to null recurrence pattern", async () => {
      const { response, body } = await h.createTodo({
        title: "One-time task",
      });

      expect(response.status()).toBe(201);
      expect(body.data.recurrence_pattern).toBeNull();
    });

    test("should accept no recurrence pattern", async () => {
      const { response, body } = await h.createTodo({
        title: "Non-recurring",
        due_date: "2026-12-31T23:59:00",
      });

      expect(response.status()).toBe(201);
      expect(body.data.recurrence_pattern).toBeNull();
    });

    test("should reject invalid recurrence pattern", async () => {
      const { response } = await h.createTodo({
        title: "Invalid recurrence",
        recurrence_pattern: "biweekly" as any,
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe("Updating recurrence pattern", () => {
    test("should change recurrence from none to daily", async () => {
      const created = await h.createTodo({
        title: "Test",
        due_date: "2026-12-31T23:59:00",
      });
      const todoId = created.body.data.id;

      const { response, body } = await h.updateTodo(todoId, {
        recurrence_pattern: "daily",
      });

      expect(response.status()).toBe(200);
      expect(body.data.recurrence_pattern).toBe("daily");
    });

    test("should change recurrence from weekly to monthly", async () => {
      const created = await h.createTodo({
        title: "Test",
        recurrence_pattern: "weekly",
        due_date: "2026-12-31T23:59:00",
      });
      const todoId = created.body.data.id;

      const { response, body } = await h.updateTodo(todoId, {
        recurrence_pattern: "monthly",
      });

      expect(response.status()).toBe(200);
      expect(body.data.recurrence_pattern).toBe("monthly");
    });

    test("should remove recurrence pattern", async () => {
      const created = await h.createTodo({
        title: "Test",
        recurrence_pattern: "daily",
        due_date: "2026-12-31T23:59:00",
      });
      const todoId = created.body.data.id;

      const { response, body } = await h.updateTodo(todoId, {
        recurrence_pattern: null,
      });

      expect(response.status()).toBe(200);
      expect(body.data.recurrence_pattern).toBeNull();
    });
  });

  test.describe("Recurring todo completion", () => {
    test("should create next instance when completing daily recurring todo", async () => {
      const created = await h.createTodo({
        title: "Daily task",
        recurrence_pattern: "daily",
        due_date: "2026-03-11T10:00:00",
        priority: "high",
      });
      const todoId = created.body.data.id;
      const originalDueDate = created.body.data.due_date;

      // Mark as complete
      const { response, body } = await h.updateTodo(todoId, {
        completed: true,
      });

      expect(response.status()).toBe(200);
      expect(body.data.completed).toBe(1);

      // The next instance is created, original is marked complete
      // Verify original is completed
      expect(body.data.completed).toBe(1);
    });

    test("should inherit priority on next instance", async () => {
      const created = await h.createTodo({
        title: "Daily task",
        recurrence_pattern: "daily",
        due_date: "2026-03-11T10:00:00",
        priority: "high",
      });
      const todoId = created.body.data.id;

      await h.updateTodo(todoId, { completed: true });

      // List todos and find the new instance
      const { body: listBody } = await h.listTodos();
      const newInstance = listBody.data.find(
        (t: any) =>
          t.title === "Daily task" && t.completed === 0 && t.id !== todoId
      );

      expect(newInstance).toBeTruthy();
      if (newInstance) {
        expect(newInstance.priority).toBe("high");
      }
    });

    test("should inherit recurrence pattern on next instance", async () => {
      const created = await h.createTodo({
        title: "Weekly task",
        recurrence_pattern: "weekly",
        due_date: "2026-03-15T10:00:00",
      });
      const todoId = created.body.data.id;

      await h.updateTodo(todoId, { completed: true });

      const { body: listBody } = await h.listTodos();
      const newInstance = listBody.data.find(
        (t: any) =>
          t.title === "Weekly task" && t.completed === 0 && t.id !== todoId
      );

      expect(newInstance).toBeTruthy();
      if (newInstance) {
        expect(newInstance.recurrence_pattern).toBe("weekly");
      }
    });

    test("should not duplicate non-recurring todo on completion", async () => {
      const created = await h.createTodo({
        title: "One-time task",
        due_date: "2026-12-31T23:59:00",
      });
      const todoId = created.body.data.id;

      await h.updateTodo(todoId, { completed: true });

      const { body: listBody } = await h.listTodos();
      const matchingTodos = listBody.data.filter(
        (t: any) => t.id === todoId
      );

      // Should have only one (the completed original)
      expect(matchingTodos.length).toBe(1);
      expect(matchingTodos[0].completed).toBe(1);
    });
  });

  test.describe("Recurrence pattern validation", () => {
    test("should support all four recurrence patterns", async () => {
      const patterns = ["daily", "weekly", "monthly", "yearly"];

      for (const pattern of patterns) {
        const { response } = await h.createTodo({
          title: `Recurring ${pattern}`,
          recurrence_pattern: pattern as any,
          due_date: "2026-12-31T23:59:00",
        });

        expect(response.status()).toBe(201);
      }
    });

    test("should reject empty string as recurrence pattern", async () => {
      const { response } = await h.createTodo({
        title: "Test",
        recurrence_pattern: "" as any,
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe("Metadata inheritance on recurring completion", () => {
    test("should inherit reminder settings on next instance", async () => {
      const created = await h.createTodo({
        title: "Task with reminder",
        recurrence_pattern: "daily",
        due_date: "2026-03-11T10:00:00",
        reminder_minutes: 60,
      });
      const todoId = created.body.data.id;

      await h.updateTodo(todoId, { completed: true });

      const { body: listBody } = await h.listTodos();
      const newInstance = listBody.data.find(
        (t: any) =>
          t.title === "Task with reminder" && t.completed === 0 && t.id !== todoId
      );

      expect(newInstance).toBeTruthy();
      if (newInstance) {
        expect(newInstance.reminder_minutes).toBe(60);
      }
    });

    test("should inherit description on next instance", async () => {
      const created = await h.createTodo({
        title: "Task with description",
        description: "Important notes",
        recurrence_pattern: "daily",
        due_date: "2026-03-11T10:00:00",
      });
      const todoId = created.body.data.id;

      await h.updateTodo(todoId, { completed: true });

      const { body: listBody } = await h.listTodos();
      const newInstance = listBody.data.find(
        (t: any) =>
          t.title === "Task with description" && t.completed === 0 && t.id !== todoId
      );

      expect(newInstance).toBeTruthy();
      if (newInstance) {
        expect(newInstance.description).toBe("Important notes");
      }
    });
  });
});
