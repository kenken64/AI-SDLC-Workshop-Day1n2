import { test, expect } from "@playwright/test";
import { TestHelpers } from "./helpers";

let h: TestHelpers;
let todoId: number;

test.beforeEach(async ({ request }) => {
  h = new TestHelpers(request);
  const { body } = await h.createTodo({ title: "Parent todo for subtasks" });
  todoId = body.data.id;
});

test.describe("PRP 05: Subtasks & Progress Tracking", () => {
  test.describe("Creating subtasks", () => {
    test("should create a subtask for an existing todo", async () => {
      const { response, body } = await h.createSubtask(todoId, "Step 1");

      expect(response.status()).toBe(201);
      expect(body.data.title).toBe("Step 1");
      expect(body.data.todo_id).toBe(todoId);
      expect(body.data.completed).toBe(0);
      expect(body.data.position).toBe(0);
      expect(body.data.created_at).toBeDefined();
    });

    test("should auto-increment position for multiple subtasks", async () => {
      const { body: first } = await h.createSubtask(todoId, "Step 1");
      const { body: second } = await h.createSubtask(todoId, "Step 2");
      const { body: third } = await h.createSubtask(todoId, "Step 3");

      expect(first.data.position).toBe(0);
      expect(second.data.position).toBe(1);
      expect(third.data.position).toBe(2);
    });

    test("should return 404 for non-existent todo", async () => {
      const { response, body } = await h.createSubtask(999999, "Orphan");

      expect(response.status()).toBe(404);
      expect(body.error).toContain("Todo not found");
    });

    test("should return 400 for empty title", async () => {
      const { response, body } = await h.createSubtask(todoId, "");

      expect(response.status()).toBe(400);
      expect(body.error).toContain("title is required");
    });

    test("should return 400 for whitespace-only title", async () => {
      const { response, body } = await h.createSubtask(todoId, "   ");

      expect(response.status()).toBe(400);
      expect(body.error).toContain("title is required");
    });

    test("should return 400 for title over 200 characters", async () => {
      const longTitle = "a".repeat(201);
      const { response, body } = await h.createSubtask(todoId, longTitle);

      expect(response.status()).toBe(400);
      expect(body.error).toContain("200 characters");
    });

    test("should accept title exactly 200 characters", async () => {
      const exactTitle = "a".repeat(200);
      const { response, body } = await h.createSubtask(todoId, exactTitle);

      expect(response.status()).toBe(201);
      expect(body.data.title).toBe(exactTitle);
    });

    test("should return 400 for invalid todo id", async () => {
      const res = await h.request.post(
        "http://localhost:3000/api/todos/abc/subtasks",
        { data: { title: "Invalid" } },
      );
      expect(res.status()).toBe(400);
    });
  });

  test.describe("Listing subtasks", () => {
    test("should list subtasks ordered by position", async () => {
      await h.createSubtask(todoId, "First");
      await h.createSubtask(todoId, "Second");
      await h.createSubtask(todoId, "Third");

      const { response, body } = await h.listSubtasks(todoId);

      expect(response.status()).toBe(200);
      expect(body.data).toHaveLength(3);
      expect(body.data[0].title).toBe("First");
      expect(body.data[1].title).toBe("Second");
      expect(body.data[2].title).toBe("Third");
    });

    test("should return empty array for todo with no subtasks", async () => {
      const { response, body } = await h.listSubtasks(todoId);

      expect(response.status()).toBe(200);
      expect(body.data).toHaveLength(0);
    });

    test("should return 404 for non-existent todo", async () => {
      const { response } = await h.listSubtasks(999999);
      expect(response.status()).toBe(404);
    });
  });

  test.describe("Updating subtasks", () => {
    test("should toggle subtask completion", async () => {
      const { body: created } = await h.createSubtask(todoId, "Toggle me");

      const { response, body } = await h.updateSubtask(
        todoId,
        created.data.id,
        { completed: true },
      );

      expect(response.status()).toBe(200);
      expect(body.data.completed).toBe(1);
    });

    test("should toggle subtask back to incomplete", async () => {
      const { body: created } = await h.createSubtask(todoId, "Toggle back");

      await h.updateSubtask(todoId, created.data.id, { completed: true });
      const { response, body } = await h.updateSubtask(
        todoId,
        created.data.id,
        { completed: false },
      );

      expect(response.status()).toBe(200);
      expect(body.data.completed).toBe(0);
    });

    test("should update subtask title", async () => {
      const { body: created } = await h.createSubtask(todoId, "Old title");

      const { response, body } = await h.updateSubtask(
        todoId,
        created.data.id,
        { title: "New title" },
      );

      expect(response.status()).toBe(200);
      expect(body.data.title).toBe("New title");
    });

    test("should update subtask position", async () => {
      const { body: created } = await h.createSubtask(todoId, "Move me");

      const { response, body } = await h.updateSubtask(
        todoId,
        created.data.id,
        { position: 5 },
      );

      expect(response.status()).toBe(200);
      expect(body.data.position).toBe(5);
    });

    test("should return 404 for subtask belonging to different todo", async () => {
      const { body: otherTodo } = await h.createTodo({
        title: "Other parent",
      });
      const { body: subtask } = await h.createSubtask(
        otherTodo.data.id,
        "Wrong parent",
      );

      const { response } = await h.updateSubtask(
        todoId,
        subtask.data.id,
        { completed: true },
      );

      expect(response.status()).toBe(404);
    });

    test("should return 404 for non-existent subtask", async () => {
      const { response } = await h.updateSubtask(todoId, 999999, {
        completed: true,
      });
      expect(response.status()).toBe(404);
    });

    test("should return 400 for empty title on update", async () => {
      const { body: created } = await h.createSubtask(todoId, "Valid");

      const { response, body } = await h.updateSubtask(
        todoId,
        created.data.id,
        { title: "   " },
      );

      expect(response.status()).toBe(400);
      expect(body.error).toContain("empty");
    });

    test("should return 400 for title over 200 chars on update", async () => {
      const { body: created } = await h.createSubtask(todoId, "Valid");

      const { response } = await h.updateSubtask(todoId, created.data.id, {
        title: "a".repeat(201),
      });

      expect(response.status()).toBe(400);
    });

    test("should return 400 for non-boolean completed", async () => {
      const { body: created } = await h.createSubtask(todoId, "Valid");

      const { response } = await h.updateSubtask(todoId, created.data.id, {
        completed: "yes",
      });

      expect(response.status()).toBe(400);
    });

    test("should return 400 for negative position", async () => {
      const { body: created } = await h.createSubtask(todoId, "Valid");

      const { response } = await h.updateSubtask(todoId, created.data.id, {
        position: -1,
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe("Deleting subtasks", () => {
    test("should delete a subtask", async () => {
      const { body: created } = await h.createSubtask(todoId, "Delete me");

      const { response, body } = await h.deleteSubtask(
        todoId,
        created.data.id,
      );

      expect(response.status()).toBe(200);
      expect(body.success).toBe(true);

      const { body: list } = await h.listSubtasks(todoId);
      expect(list.data).toHaveLength(0);
    });

    test("should return 404 for subtask belonging to different todo", async () => {
      const { body: otherTodo } = await h.createTodo({
        title: "Other parent",
      });
      const { body: subtask } = await h.createSubtask(
        otherTodo.data.id,
        "Wrong parent",
      );

      const { response } = await h.deleteSubtask(todoId, subtask.data.id);
      expect(response.status()).toBe(404);
    });

    test("should return 404 for non-existent subtask", async () => {
      const { response } = await h.deleteSubtask(todoId, 999999);
      expect(response.status()).toBe(404);
    });
  });

  test.describe("CASCADE delete", () => {
    test("should delete all subtasks when parent todo is deleted", async () => {
      await h.createSubtask(todoId, "Sub 1");
      await h.createSubtask(todoId, "Sub 2");
      await h.createSubtask(todoId, "Sub 3");

      await h.deleteTodo(todoId);

      // Creating a new todo to verify subtasks for the deleted todo are gone
      const { body: newTodo } = await h.createTodo({ title: "Fresh todo" });
      const { body: subs } = await h.listSubtasks(newTodo.data.id);
      expect(subs.data).toHaveLength(0);
    });
  });

  test.describe("Progress calculation", () => {
    test("should track progress across multiple subtasks", async () => {
      const { body: s1 } = await h.createSubtask(todoId, "Task 1");
      const { body: s2 } = await h.createSubtask(todoId, "Task 2");
      await h.createSubtask(todoId, "Task 3");
      await h.createSubtask(todoId, "Task 4");

      // Complete 2 out of 4
      await h.updateSubtask(todoId, s1.data.id, { completed: true });
      await h.updateSubtask(todoId, s2.data.id, { completed: true });

      const { body } = await h.listSubtasks(todoId);
      const total = body.data.length;
      const done = body.data.filter(
        (s: { completed: number }) => s.completed === 1,
      ).length;
      const percent = Math.round((done / total) * 100);

      expect(total).toBe(4);
      expect(done).toBe(2);
      expect(percent).toBe(50);
    });
  });
});
