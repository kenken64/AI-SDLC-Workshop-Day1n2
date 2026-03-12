import { test, expect } from "@playwright/test";
import { TestHelpers } from "./helpers";

let h: TestHelpers;

test.beforeEach(async ({ request }) => {
  h = new TestHelpers(request);
});

test.describe("PRP 07: Template System", () => {
  test.describe("Creating templates", () => {
    test("should create a template with minimal fields", async () => {
      const { response, body } = await h.createTemplate({
        title: "Basic template",
      });

      expect(response.status()).toBe(201);
      expect(body.data.title).toBe("Basic template");
      expect(body.data.priority).toBe("medium");
      expect(body.data.subtasks_json).toBe("[]");
      expect(body.data.due_date_offset_days).toBeNull();
      expect(body.data.created_at).toBeDefined();
      expect(body.data.updated_at).toBeDefined();
    });

    test("should create a template with all fields", async () => {
      const { response, body } = await h.createTemplate({
        title: "Full template",
        description: "A complete template",
        priority: "high",
        subtasks: [
          { title: "Step 1", position: 0 },
          { title: "Step 2", position: 1 },
        ],
        due_date_offset_days: 3,
      });

      expect(response.status()).toBe(201);
      expect(body.data.title).toBe("Full template");
      expect(body.data.description).toBe("A complete template");
      expect(body.data.priority).toBe("high");
      expect(body.data.due_date_offset_days).toBe(3);

      const subtasks = JSON.parse(body.data.subtasks_json);
      expect(subtasks).toHaveLength(2);
      expect(subtasks[0].title).toBe("Step 1");
      expect(subtasks[1].title).toBe("Step 2");
    });

    test("should return 400 for missing title", async () => {
      const res = await h.request.post("http://localhost:3000/api/templates", {
        data: { description: "No title" },
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Title is required");
    });

    test("should return 400 for empty title", async () => {
      const { response, body } = await h.createTemplate({ title: "   " });

      expect(response.status()).toBe(400);
      expect(body.error).toContain("Title is required");
    });

    test("should return 400 for title over 120 characters", async () => {
      const { response, body } = await h.createTemplate({
        title: "a".repeat(121),
      });

      expect(response.status()).toBe(400);
      expect(body.error).toContain("120 characters");
    });

    test("should return 400 for description over 500 characters", async () => {
      const { response, body } = await h.createTemplate({
        title: "Valid",
        description: "a".repeat(501),
      });

      expect(response.status()).toBe(400);
      expect(body.error).toContain("500 characters");
    });

    test("should return 400 for invalid priority", async () => {
      const res = await h.request.post("http://localhost:3000/api/templates", {
        data: { title: "Bad priority", priority: "critical" },
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Priority must be");
    });

    test("should return 400 for negative due_date_offset_days", async () => {
      const { response, body } = await h.createTemplate({
        title: "Negative offset",
        due_date_offset_days: -1,
      });

      expect(response.status()).toBe(400);
      expect(body.error).toContain("non-negative");
    });

    test("should return 400 for more than 20 subtasks", async () => {
      const subtasks = Array.from({ length: 21 }, (_, i) => ({
        title: `Sub ${i}`,
        position: i,
      }));

      const { response, body } = await h.createTemplate({
        title: "Too many subtasks",
        subtasks,
      });

      expect(response.status()).toBe(400);
      expect(body.error).toContain("20 subtasks");
    });

    test("should return 400 for subtask without title", async () => {
      const res = await h.request.post("http://localhost:3000/api/templates", {
        data: {
          title: "Bad subtask",
          subtasks: [{ title: "", position: 0 }],
        },
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("subtask must have a title");
    });

    test("should return 400 for subtask title over 200 characters", async () => {
      const { response, body } = await h.createTemplate({
        title: "Long subtask",
        subtasks: [{ title: "a".repeat(201), position: 0 }],
      });

      expect(response.status()).toBe(400);
      expect(body.error).toContain("200 characters");
    });

    test("should accept exactly 20 subtasks", async () => {
      const subtasks = Array.from({ length: 20 }, (_, i) => ({
        title: `Sub ${i}`,
        position: i,
      }));

      const { response, body } = await h.createTemplate({
        title: "Max subtasks",
        subtasks,
      });

      expect(response.status()).toBe(201);
      const parsed = JSON.parse(body.data.subtasks_json);
      expect(parsed).toHaveLength(20);
    });
  });

  test.describe("Listing templates", () => {
    test("should list templates ordered by created_at DESC", async () => {
      await h.createTemplate({ title: "First" });
      await h.createTemplate({ title: "Second" });

      const { response, body } = await h.listTemplates();

      expect(response.status()).toBe(200);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data.length).toBeGreaterThanOrEqual(2);

      // Most recent should be first
      const titles = body.data.map((t: { title: string }) => t.title);
      expect(titles.indexOf("Second")).toBeLessThan(titles.indexOf("First"));
    });
  });

  test.describe("Updating templates", () => {
    test("should update template title", async () => {
      const { body: created } = await h.createTemplate({
        title: "Old title",
      });

      const { response, body } = await h.updateTemplate(created.data.id, {
        title: "New title",
      });

      expect(response.status()).toBe(200);
      expect(body.data.title).toBe("New title");
    });

    test("should update template priority", async () => {
      const { body: created } = await h.createTemplate({
        title: "Priority change",
      });

      const { response, body } = await h.updateTemplate(created.data.id, {
        priority: "low",
      });

      expect(response.status()).toBe(200);
      expect(body.data.priority).toBe("low");
    });

    test("should update template subtasks", async () => {
      const { body: created } = await h.createTemplate({
        title: "Subtask update",
      });

      const { response, body } = await h.updateTemplate(created.data.id, {
        subtasks: [
          { title: "New step 1", position: 0 },
          { title: "New step 2", position: 1 },
        ],
      });

      expect(response.status()).toBe(200);
      const subtasks = JSON.parse(body.data.subtasks_json);
      expect(subtasks).toHaveLength(2);
    });

    test("should update due_date_offset_days", async () => {
      const { body: created } = await h.createTemplate({
        title: "Offset update",
        due_date_offset_days: 3,
      });

      const { response, body } = await h.updateTemplate(created.data.id, {
        due_date_offset_days: 7,
      });

      expect(response.status()).toBe(200);
      expect(body.data.due_date_offset_days).toBe(7);
    });

    test("should return 404 for non-existent template", async () => {
      const { response } = await h.updateTemplate(999999, {
        title: "Ghost",
      });
      expect(response.status()).toBe(404);
    });

    test("should return 400 for empty title on update", async () => {
      const { body: created } = await h.createTemplate({
        title: "Valid",
      });

      const { response } = await h.updateTemplate(created.data.id, {
        title: "   ",
      });
      expect(response.status()).toBe(400);
    });

    test("should return 400 for invalid priority on update", async () => {
      const { body: created } = await h.createTemplate({
        title: "Valid",
      });

      const res = await h.request.put(
        `http://localhost:3000/api/templates/${created.data.id}`,
        { data: { priority: "critical" } },
      );
      expect(res.status()).toBe(400);
    });

    test("should update updated_at timestamp", async () => {
      const { body: created } = await h.createTemplate({
        title: "Timestamp check",
      });

      const { body: updated } = await h.updateTemplate(created.data.id, {
        title: "Updated timestamp",
      });

      expect(updated.data.updated_at).not.toBe(created.data.created_at);
    });
  });

  test.describe("Deleting templates", () => {
    test("should delete an existing template", async () => {
      const { body: created } = await h.createTemplate({
        title: "Delete me",
      });

      const { response, body } = await h.deleteTemplate(created.data.id);

      expect(response.status()).toBe(200);
      expect(body.success).toBe(true);
    });

    test("should return 404 for non-existent template", async () => {
      const { response } = await h.deleteTemplate(999999);
      expect(response.status()).toBe(404);
    });

    test("should not affect todos created from deleted template", async () => {
      const { body: created } = await h.createTemplate({
        title: "Template for todo",
      });

      const { body: usedTodo } = await h.useTemplate(created.data.id);
      const todoId = usedTodo.data.id;

      await h.deleteTemplate(created.data.id);

      // Todo should still exist
      const { body: todos } = await h.listTodos();
      const found = todos.data.find(
        (t: { id: number }) => t.id === todoId,
      );
      expect(found).toBeDefined();
    });
  });

  test.describe("Using templates", () => {
    test("should create a todo from a template", async () => {
      const { body: tmpl } = await h.createTemplate({
        title: "Sprint review",
        description: "Weekly sprint review",
        priority: "high",
      });

      const { response, body } = await h.useTemplate(tmpl.data.id);

      expect(response.status()).toBe(201);
      expect(body.data.title).toBe("Sprint review");
      expect(body.data.description).toBe("Weekly sprint review");
      expect(body.data.priority).toBe("high");
      expect(body.data.completed).toBe(0);
    });

    test("should calculate due_date from offset", async () => {
      const { body: tmpl } = await h.createTemplate({
        title: "Offset todo",
        due_date_offset_days: 5,
      });

      const { response, body } = await h.useTemplate(tmpl.data.id);

      expect(response.status()).toBe(201);
      expect(body.data.due_date).not.toBeNull();

      // Due date should be roughly 5 days from now
      const dueDate = new Date(body.data.due_date);
      const now = new Date();
      const diffMs = dueDate.getTime() - now.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(4);
      expect(diffDays).toBeLessThan(6);
    });

    test("should create todo with null due_date when no offset", async () => {
      const { body: tmpl } = await h.createTemplate({
        title: "No offset",
      });

      const { body } = await h.useTemplate(tmpl.data.id);
      expect(body.data.due_date).toBeNull();
    });

    test("should create subtasks from template", async () => {
      const { body: tmpl } = await h.createTemplate({
        title: "With subtasks",
        subtasks: [
          { title: "First step", position: 0 },
          { title: "Second step", position: 1 },
          { title: "Third step", position: 2 },
        ],
      });

      const { body: usedTodo } = await h.useTemplate(tmpl.data.id);
      const { body: subs } = await h.listSubtasks(usedTodo.data.id);

      expect(subs.data).toHaveLength(3);
      expect(subs.data[0].title).toBe("First step");
      expect(subs.data[1].title).toBe("Second step");
      expect(subs.data[2].title).toBe("Third step");
      expect(subs.data[0].completed).toBe(0);
    });

    test("should create todo with no subtasks from empty template", async () => {
      const { body: tmpl } = await h.createTemplate({
        title: "Empty subtasks",
        subtasks: [],
      });

      const { body: usedTodo } = await h.useTemplate(tmpl.data.id);
      const { body: subs } = await h.listSubtasks(usedTodo.data.id);

      expect(subs.data).toHaveLength(0);
    });

    test("should return 404 for non-existent template", async () => {
      const { response } = await h.useTemplate(999999);
      expect(response.status()).toBe(404);
    });

    test("should return 400 for invalid template id", async () => {
      const res = await h.request.post(
        "http://localhost:3000/api/templates/abc/use",
      );
      expect(res.status()).toBe(400);
    });

    test("should create independent todos from same template", async () => {
      const { body: tmpl } = await h.createTemplate({
        title: "Reusable",
        priority: "low",
      });

      const { body: todo1 } = await h.useTemplate(tmpl.data.id);
      const { body: todo2 } = await h.useTemplate(tmpl.data.id);

      expect(todo1.data.id).not.toBe(todo2.data.id);
      expect(todo1.data.title).toBe("Reusable");
      expect(todo2.data.title).toBe("Reusable");
    });
  });
});
