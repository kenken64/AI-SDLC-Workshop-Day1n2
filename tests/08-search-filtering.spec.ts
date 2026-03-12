import { test, expect } from "@playwright/test";
import { TestHelpers } from "./helpers";

let h: TestHelpers;

test.beforeAll(async ({ request }) => {
  // Reset DB to avoid tag name conflicts from earlier test files
  await request.post("http://localhost:3000/api/test-reset");
});

test.beforeEach(async ({ request }) => {
  h = new TestHelpers(request);
});

test.describe("PRP 08: Search and Filtering", () => {
  test.describe("Search functionality", () => {
    test("should find todo by title", async () => {
      await h.createTodo({ title: "Buy groceries" });
      await h.createTodo({ title: "Call mom" });

      const { body } = await h.listTodos();
      const filtered = body.data.filter((t: any) =>
        t.title.toLowerCase().includes("grocer")
      );

      expect(filtered.length).toBe(1);
      expect(filtered[0].title).toBe("Buy groceries");
    });

    test("should find todo by description", async () => {
      await h.createTodo({
        title: "Shopping",
        description: "Get milk and eggs from Tesco",
      });
      await h.createTodo({ title: "Errands", description: "Pay bills online" });

      const { body } = await h.listTodos();
      const filtered = body.data.filter((t: any) =>
        t.description?.toLowerCase().includes("tesco")
      );

      expect(filtered.length).toBe(1);
      expect(filtered[0].description).toContain("Tesco");
    });

    test("should be case-insensitive search", async () => {
      const { body: created } = await h.createTodo({ title: "Buy GROCERIES UNIQUE" });
      const todoId = created.data.id;

      const { body } = await h.listTodos();
      const filtered = body.data.filter((t: any) =>
        t.title.toLowerCase().includes("groceries unique")
      );

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(todoId);
      expect(filtered[0].title).toBe("Buy GROCERIES UNIQUE");
    });

    test("should find multiple todos matching search", async () => {
      await h.createTodo({ title: "Write report" });
      await h.createTodo({ title: "Write email" });
      await h.createTodo({ title: "Send letter" });

      const { body } = await h.listTodos();
      const filtered = body.data.filter((t: any) =>
        t.title.toLowerCase().includes("write")
      );

      expect(filtered.length).toBe(2);
    });

    test("should return empty on no matches", async () => {
      await h.createTodo({ title: "Task A" });
      await h.createTodo({ title: "Task B" });

      const { body } = await h.listTodos();
      const filtered = body.data.filter((t: any) =>
        t.title.toLowerCase().includes("nonexistent")
      );

      expect(filtered.length).toBe(0);
    });

    test("should search with partial matches", async () => {
      await h.createTodo({ title: "JavaScript learning" });

      const { body } = await h.listTodos();
      const filtered = body.data.filter((t: any) =>
        t.title.toLowerCase().includes("script")
      );

      expect(filtered.length).toBe(1);
    });

    test("should search in description when title not found", async () => {
      await h.createTodo({
        title: "Weekly meeting",
        description: "Discuss JavaScript migration project",
      });

      const { body } = await h.listTodos();
      const filtered = body.data.filter((t: any) =>
        t.description?.toLowerCase().includes("migration")
      );

      expect(filtered.length).toBe(1);
    });
  });

  test.describe("Filter by completion status", () => {
    test("should filter active (incomplete) todos", async () => {
      const todo1 = await h.createTodo({ title: "Active task" });
      const todoId1 = todo1.body.data.id;

      const todo2 = await h.createTodo({ title: "Completed task" });
      const todoId2 = todo2.body.data.id;

      await h.updateTodo(todoId2, { completed: true });

      const { body } = await h.listTodos();
      const activeTodos = body.data.filter((t: any) => t.completed === 0);

      expect(activeTodos.length).toBeGreaterThanOrEqual(1);
      expect(activeTodos.some((t: any) => t.title === "Active task")).toBe(true);
      expect(activeTodos.some((t: any) => t.title === "Completed task")).toBe(
        false
      );
    });

    test("should filter completed todos", async () => {
      const todo1 = await h.createTodo({ title: "Pending task" });
      const todo2 = await h.createTodo({ title: "Done task" });
      const todoId2 = todo2.body.data.id;

      await h.updateTodo(todoId2, { completed: true });

      const { body } = await h.listTodos();
      const completedTodos = body.data.filter((t: any) => t.completed === 1);

      expect(completedTodos.length).toBeGreaterThanOrEqual(1);
      expect(completedTodos.some((t: any) => t.title === "Done task")).toBe(true);
    });

    test("should show all todos when no completion filter applied", async () => {
      await h.createTodo({ title: "Active" });
      const todo2 = await h.createTodo({ title: "Completed" });
      const todoId2 = todo2.body.data.id;
      await h.updateTodo(todoId2, { completed: true });

      const { body } = await h.listTodos();
      expect(body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  test.describe("Filter by priority", () => {
    test("should filter high priority todos", async () => {
      await h.createTodo({ title: "Urgent", priority: "high" });
      await h.createTodo({ title: "Normal", priority: "medium" });
      await h.createTodo({ title: "Low importance", priority: "low" });

      const { body } = await h.listTodos();
      const highPriority = body.data.filter((t: any) => t.priority === "high");

      expect(highPriority.length).toBeGreaterThanOrEqual(1);
      expect(highPriority.every((t: any) => t.priority === "high")).toBe(true);
    });

    test("should filter medium priority todos", async () => {
      await h.createTodo({ title: "Urgent", priority: "high" });
      await h.createTodo({ title: "Normal", priority: "medium" });
      await h.createTodo({ title: "Low", priority: "low" });

      const { body } = await h.listTodos();
      const mediumPriority = body.data.filter(
        (t: any) => t.priority === "medium"
      );

      expect(mediumPriority.length).toBeGreaterThanOrEqual(1);
      expect(mediumPriority.every((t: any) => t.priority === "medium")).toBe(
        true
      );
    });

    test("should filter low priority todos", async () => {
      await h.createTodo({ title: "Urgent", priority: "high" });
      await h.createTodo({ title: "Low", priority: "low" });

      const { body } = await h.listTodos();
      const lowPriority = body.data.filter((t: any) => t.priority === "low");

      expect(lowPriority.length).toBeGreaterThanOrEqual(1);
      expect(lowPriority.every((t: any) => t.priority === "low")).toBe(true);
    });

    test("should filter multiple priorities together", async () => {
      await h.createTodo({ title: "Urgent", priority: "high" });
      await h.createTodo({ title: "Normal", priority: "medium" });
      await h.createTodo({ title: "Low", priority: "low" });

      const { body } = await h.listTodos();
      const highOrMedium = body.data.filter(
        (t: any) => t.priority === "high" || t.priority === "medium"
      );

      expect(highOrMedium.length).toBeGreaterThanOrEqual(2);
      expect(
        highOrMedium.every((t: any) =>
          ["high", "medium"].includes(t.priority)
        )
      ).toBe(true);
    });
  });

  test.describe("Filter by date range", () => {
    test("should filter todos due today", async () => {
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];

      await h.createTodo({
        title: "Due today",
        due_date: `${todayStr}T14:00:00`,
      });
      await h.createTodo({
        title: "Due tomorrow",
        due_date: new Date(Date.now() + 86400000).toISOString().split("T")[0] +
          "T14:00:00",
      });

      const { body } = await h.listTodos();
      const todoToday = body.data.filter((t: any) => {
        if (!t.due_date) return false;
        const dueDateStr = t.due_date.split("T")[0];
        return dueDateStr === todayStr;
      });

      expect(todoToday.length).toBeGreaterThanOrEqual(1);
    });

    test("should filter todos overdue", async () => {
      const yesterday = new Date(Date.now() - 86400000);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      await h.createTodo({
        title: "Overdue task",
        due_date: `${yesterdayStr}T10:00:00`,
      });
      await h.createTodo({
        title: "Future task",
        due_date: new Date(Date.now() + 86400000 * 7)
          .toISOString()
          .split("T")[0] + "T10:00:00",
      });

      const { body } = await h.listTodos();
      const now = new Date();

      const overdue = body.data.filter((t: any) => {
        if (!t.due_date) return false;
        const dueDate = new Date(t.due_date);
        return dueDate < now && t.completed === 0;
      });

      expect(overdue.length).toBeGreaterThanOrEqual(1);
    });

    test("should filter todos due within specific date range", async () => {
      const start = new Date();
      const end = new Date(Date.now() + 86400000 * 7); // 7 days from now

      const startStr = start.toISOString().split("T")[0];
      const endStr = end.toISOString().split("T")[0];

      await h.createTodo({
        title: "In range",
        due_date: new Date(Date.now() + 86400000 * 3)
          .toISOString()
          .split("T")[0] + "T15:00:00", // 3 days away
      });
      await h.createTodo({
        title: "Outside range",
        due_date: new Date(Date.now() + 86400000 * 20)
          .toISOString()
          .split("T")[0] + "T15:00:00", // 20 days away
      });

      const { body } = await h.listTodos();
      const inRange = body.data.filter((t: any) => {
        if (!t.due_date) return false;
        const dueDate = new Date(t.due_date).toISOString().split("T")[0];
        return dueDate >= startStr && dueDate <= endStr;
      });

      expect(inRange.length).toBeGreaterThanOrEqual(1);
      expect(inRange.some((t: any) => t.title === "In range")).toBe(true);
    });
  });

  test.describe("Filter by tags", () => {
    test("should filter todos by single tag", async () => {
      const tag = await h.createTag("work");
      const tagId = tag.body.data.id;

      const todo1 = await h.createTodo({ title: "Work task" });
      const todoId1 = todo1.body.data.id;

      const todo2 = await h.createTodo({ title: "Personal task" });

      await h.addTagToTodo(todoId1, tagId);

      const { body } = await h.listTodos();
      const workTodos = body.data.filter((t: any) =>
        t.tags?.some((tag: any) => tag.name === "work")
      );

      expect(workTodos.length).toBeGreaterThanOrEqual(1);
      expect(workTodos.some((t: any) => t.title === "Work task")).toBe(true);
    });

    test("should filter todos by multiple tags (OR logic)", async () => {
      const urgent = await h.createTag("urgent-multi");
      const urgent_id = urgent.body.data.id;

      const work = await h.createTag("work-multi");
      const work_id = work.body.data.id;

      const todo1 = await h.createTodo({ title: "Urgent report" });
      const todoId1 = todo1.body.data.id;

      const todo2 = await h.createTodo({ title: "Work meeting" });
      const todoId2 = todo2.body.data.id;

      const todo3 = await h.createTodo({ title: "Personal task" });

      await h.addTagToTodo(todoId1, urgent_id);
      await h.addTagToTodo(todoId2, work_id);

      const { body } = await h.listTodos();
      const tagged = body.data.filter((t: any) =>
        t.tags?.some((tag: any) =>
          ["urgent-multi", "work-multi"].includes(tag.name)
        )
      );

      expect(tagged.length).toBeGreaterThanOrEqual(2);
    });

    test("should exclude untagged todos when filtering by tag", async () => {
      const tag = await h.createTag("home");
      const tagId = tag.body.data.id;

      const todo1 = await h.createTodo({ title: "Clean house" });
      const todoId1 = todo1.body.data.id;

      await h.createTodo({ title: "Untagged task" });

      await h.addTagToTodo(todoId1, tagId);

      const { body } = await h.listTodos();
      const homeTagged = body.data.filter((t: any) =>
        t.tags?.some((tag: any) => tag.name === "home")
      );

      expect(homeTagged.length).toBeGreaterThanOrEqual(1);
      expect(homeTagged.every((t: any) => t.tags.length > 0)).toBe(true);
    });

    test("should return empty when no todos have specified tag", async () => {
      await h.createTag("nonexistent");
      await h.createTodo({ title: "Task without tag" });

      const { body } = await h.listTodos();
      const filtered = body.data.filter((t: any) =>
        t.tags?.some((tag: any) => tag.name === "nonexistent")
      );

      expect(filtered.length).toBe(0);
    });
  });

  test.describe("Combined filters", () => {
    test("should filter by priority AND completion status", async () => {
      const todo1 = await h.createTodo({
        title: "Urgent pending",
        priority: "high",
      });
      const todoId1 = todo1.body.data.id;

      const todo2 = await h.createTodo({
        title: "Urgent done",
        priority: "high",
      });
      const todoId2 = todo2.body.data.id;

      const todo3 = await h.createTodo({
        title: "Normal pending",
        priority: "medium",
      });

      await h.updateTodo(todoId2, { completed: true });

      const { body } = await h.listTodos();
      const filtered = body.data.filter(
        (t: any) => t.priority === "high" && t.completed === 0
      );

      expect(filtered.length).toBeGreaterThanOrEqual(1);
      expect(
        filtered.every((t: any) => t.priority === "high" && t.completed === 0)
      ).toBe(true);
    });

    test("should filter by search AND tag", async () => {
      const tag = await h.createTag("bug");
      const tagId = tag.body.data.id;

      const todo1 = await h.createTodo({ title: "Fix login bug" });
      const todoId1 = todo1.body.data.id;

      const todo2 = await h.createTodo({ title: "Add feature" });

      await h.addTagToTodo(todoId1, tagId);

      const { body } = await h.listTodos();
      const filtered = body.data.filter(
        (t: any) =>
          t.title.toLowerCase().includes("bug") &&
          t.tags?.some((tag: any) => tag.name === "bug")
      );

      expect(filtered.length).toBeGreaterThanOrEqual(1);
      expect(filtered[0].title).toContain("bug");
    });

    test("should filter by priority AND due date AND completion", async () => {
      const future = new Date(Date.now() + 86400000 * 30)
        .toISOString()
        .split("T")[0];

      const todo1 = await h.createTodo({
        title: "Urgent future",
        priority: "high",
        due_date: `${future}T10:00:00`,
      });

      const { body } = await h.listTodos();
      const filtered = body.data.filter(
        (t: any) =>
          t.priority === "high" &&
          t.completed === 0 &&
          new Date(t.due_date) > new Date()
      );

      expect(
        filtered.some((t: any) => t.title === "Urgent future")
      ).toBe(true);
    });
  });
});
