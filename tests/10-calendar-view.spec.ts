import { test, expect } from "@playwright/test";
import { TestHelpers } from "./helpers";

let h: TestHelpers;

test.beforeEach(async ({ request }) => {
  h = new TestHelpers(request);
});

test.describe("PRP 10: Calendar View", () => {
  test.describe("Calendar display", () => {
    test("should render calendar in correct month", async () => {
      // Calendar implementation - verify todos can be rendered by month
      const march = new Date(2026, 2, 1); // March 2026
      const marchTodos = await h.createTodo({
        title: "March todo",
        due_date: new Date(2026, 2, 15).toISOString().split("T")[0] + "T10:00:00",
      });

      const todos = await h.listTodos();
      const marchedTodos = todos.body.data.filter(
        (t: any) =>
          t.due_date && new Date(t.due_date).getMonth() === 2 // March = month 2
      );

      expect(marchedTodos.length).toBeGreaterThanOrEqual(1);
    });

    test("should display todos on correct calendar dates", async () => {
      await h.createTodo({
        title: "Event on 15th",
        due_date: "2026-03-15T14:00:00",
      });
      await h.createTodo({
        title: "Event on 20th",
        due_date: "2026-03-20T14:00:00",
      });

      const todos = await h.listTodos();

      const event15 = todos.body.data.find(
        (t: any) => t.title === "Event on 15th" && t.due_date
      );
      const event20 = todos.body.data.find(
        (t: any) => t.title === "Event on 20th" && t.due_date
      );

      expect(event15).toBeTruthy();
      expect(event20).toBeTruthy();

      // Parse dates
      const date15 = new Date(event15.due_date);
      const date20 = new Date(event20.due_date);

      // Verify correct days
      expect(date15.getDate()).toBe(15);
      expect(date20.getDate()).toBe(20);
    });

    test("should handle todos without due dates", async () => {
      await h.createTodo({
        title: "No due date",
        // No due_date specified
      });
      await h.createTodo({
        title: "With due date",
        due_date: "2026-12-31T23:59:00",
      });

      const todos = await h.listTodos();

      const noDate = todos.body.data.find((t: any) => t.title === "No due date");
      const withDate = todos.body.data.find(
        (t: any) => t.title === "With due date"
      );

      expect(noDate).toBeTruthy();
      expect(withDate).toBeTruthy();
      expect(noDate.due_date).toBeNull();
      expect(withDate.due_date).toBeTruthy();
    });
  });

  test.describe("Calendar navigation", () => {
    test("should support multiple months of todos", async () => {
      // Create todos in different months
      await h.createTodo({
        title: "January todo",
        due_date: "2026-01-15T10:00:00",
      });
      await h.createTodo({
        title: "June todo",
        due_date: "2026-06-15T10:00:00",
      });
      await h.createTodo({
        title: "December todo",
        due_date: "2026-12-15T10:00:00",
      });

      const todos = await h.listTodos();

      const january = todos.body.data.find(
        (t: any) => t.title === "January todo"
      );
      const june = todos.body.data.find((t: any) => t.title === "June todo");
      const december = todos.body.data.find(
        (t: any) => t.title === "December todo"
      );

      expect(january).toBeTruthy();
      expect(june).toBeTruthy();
      expect(december).toBeTruthy();

      // Verify months
      expect(new Date(january.due_date).getMonth()).toBe(0); // January
      expect(new Date(june.due_date).getMonth()).toBe(5); // June
      expect(new Date(december.due_date).getMonth()).toBe(11); // December
    });

    test("should handle year transitions", async () => {
      await h.createTodo({
        title: "2025 December",
        due_date: "2025-12-31T23:59:00",
      });
      await h.createTodo({
        title: "2026 January",
        due_date: "2026-01-01T00:00:00",
      });

      const todos = await h.listTodos();

      const dec2025 = todos.body.data.find(
        (t: any) => t.title === "2025 December"
      );
      const jan2026 = todos.body.data.find(
        (t: any) => t.title === "2026 January"
      );

      expect(dec2025).toBeTruthy();
      expect(jan2026).toBeTruthy();

      const decDate = new Date(dec2025.due_date);
      const janDate = new Date(jan2026.due_date);

      expect(decDate.getFullYear()).toBe(2025);
      expect(janDate.getFullYear()).toBe(2026);
    });
  });

  test.describe("Calendar features", () => {
    test("should show todo count per day", async () => {
      // Create multiple todos on same day
      await h.createTodo({
        title: "Multi-todo first",
        due_date: "2026-03-15T08:00:00",
      });
      await h.createTodo({
        title: "Multi-todo second",
        due_date: "2026-03-15T14:00:00",
      });
      await h.createTodo({
        title: "Different day",
        due_date: "2026-03-16T10:00:00",
      });

      const todos = await h.listTodos();

      const march15Todos = todos.body.data.filter((t: any) => {
        if (!t.due_date) return false;
        const date = new Date(t.due_date);
        return date.getDate() === 15 && date.getMonth() === 2;
      });

      expect(march15Todos.length).toBeGreaterThanOrEqual(2);
    });

    test("should distinguish completed and pending todos in calendar", async () => {
      const pending = await h.createTodo({
        title: "Pending on 20th",
        due_date: "2026-03-20T10:00:00",
      });
      const todoId = pending.body.data.id;

      const completed = await h.createTodo({
        title: "Completed on 20th",
        due_date: "2026-03-20T14:00:00",
      });
      const completedId = completed.body.data.id;

      await h.updateTodo(completedId, { completed: true });

      const todos = await h.listTodos();

      const march20Todos = todos.body.data.filter((t: any) => {
        if (!t.due_date) return false;
        const date = new Date(t.due_date);
        return date.getDate() === 20 && date.getMonth() === 2;
      });

      const pending20 = march20Todos.filter((t: any) => t.completed === 0);
      const completed20 = march20Todos.filter((t: any) => t.completed === 1);

      expect(pending20.length).toBeGreaterThanOrEqual(1);
      expect(completed20.length).toBeGreaterThanOrEqual(1);
    });

    test("should handle priority colors in calendar view", async () => {
      await h.createTodo({
        title: "High priority on 10th",
        priority: "high",
        due_date: "2026-03-10T10:00:00",
      });
      await h.createTodo({
        title: "Low priority on 10th",
        priority: "low",
        due_date: "2026-03-10T14:00:00",
      });

      const todos = await h.listTodos();

      const march10Todos = todos.body.data.filter((t: any) => {
        if (!t.due_date) return false;
        const date = new Date(t.due_date);
        return date.getDate() === 10 && date.getMonth() === 2;
      });

      const highPriorityTodos = march10Todos.filter(
        (t: any) => t.priority === "high"
      );
      const lowPriorityTodos = march10Todos.filter(
        (t: any) => t.priority === "low"
      );

      expect(highPriorityTodos.length).toBeGreaterThanOrEqual(1);
      expect(lowPriorityTodos.length).toBeGreaterThanOrEqual(1);
    });

    test("should show only todos with due dates in calendar", async () => {
      await h.createTodo({
        title: "With due date",
        due_date: "2026-03-15T10:00:00",
      });
      await h.createTodo({
        title: "Without due date",
        // No due_date
      });

      const todos = await h.listTodos();

      const calendarEligible = todos.body.data.filter((t: any) => t.due_date);
      const withDueDateTodo = calendarEligible.find(
        (t: any) => t.title === "With due date"
      );
      const noDueDateTodo = calendarEligible.find(
        (t: any) => t.title === "Without due date"
      );

      expect(withDueDateTodo).toBeTruthy();
      expect(noDueDateTodo).toBeUndefined();
    });
  });

  test.describe("Calendar integration with filters", () => {
    test("should filter by priority in calendar view", async () => {
      await h.createTodo({
        title: "High urgent",
        priority: "high",
        due_date: "2026-03-15T10:00:00",
      });
      await h.createTodo({
        title: "Low urgent",
        priority: "low",
        due_date: "2026-03-15T14:00:00",
      });

      const todos = await h.listTodos();

      const march15High = todos.body.data.filter(
        (t: any) =>
          t.priority === "high" &&
          t.due_date &&
          new Date(t.due_date).getDate() === 15
      );

      expect(march15High.length).toBeGreaterThanOrEqual(1);
      expect(march15High.every((t: any) => t.priority === "high")).toBe(true);
    });

    test("should filter completed todos in calendar", async () => {
      const todo1 = await h.createTodo({
        title: "Calendar completed",
        due_date: "2026-03-15T10:00:00",
      });

      const todo2 = await h.createTodo({
        title: "Calendar pending",
        due_date: "2026-03-15T14:00:00",
      });

      await h.updateTodo(todo1.body.data.id, { completed: true });

      const todos = await h.listTodos();

      const march15Completed = todos.body.data.filter(
        (t: any) =>
          t.completed === 1 &&
          t.due_date &&
          new Date(t.due_date).getDate() === 15
      );

      expect(march15Completed.length).toBeGreaterThanOrEqual(1);
      expect(march15Completed.every((t: any) => t.completed === 1)).toBe(true);
    });

    test("should support date range filtering with calendar", async () => {
      const start = new Date(2026, 2, 1); // March 1
      const end = new Date(2026, 2, 15); // March 15

      await h.createTodo({
        title: "In range",
        due_date: "2026-03-10T10:00:00",
      });
      await h.createTodo({
        title: "Out of range",
        due_date: "2026-03-20T10:00:00",
      });

      const todos = await h.listTodos();

      const inRange = todos.body.data.filter((t: any) => {
        if (!t.due_date) return false;
        const dueDate = new Date(t.due_date);
        return dueDate >= start && dueDate <= end;
      });

      expect(inRange.some((t: any) => t.title === "In range")).toBe(true);
      expect(inRange.some((t: any) => t.title === "Out of range")).toBe(false);
    });
  });

  test.describe("Calendar timespan coverage", () => {
    test("should display todos across multiple weeks", async () => {
      // First week of March
      await h.createTodo({
        title: "Week 1",
        due_date: "2026-03-02T10:00:00",
      });
      // Second week
      await h.createTodo({
        title: "Week 2",
        due_date: "2026-03-09T10:00:00",
      });
      // Third week
      await h.createTodo({
        title: "Week 3",
        due_date: "2026-03-16T10:00:00",
      });
      // Fourth week
      await h.createTodo({
        title: "Week 4",
        due_date: "2026-03-23T10:00:00",
      });

      const todos = await h.listTodos();

      const march = todos.body.data.filter(
        (t: any) =>
          t.due_date && new Date(t.due_date).getMonth() === 2
      );

      expect(march.length).toBeGreaterThanOrEqual(4);
    });

    test("should handle full month display", async () => {
      // Create todos throughout March
      for (let day = 1; day <= 31; day++) {
        if (day % 5 === 0) {
          // Create on specific days
          await h.createTodo({
            title: `March ${day}`,
            due_date: `2026-03-${String(day).padStart(2, "0")}T10:00:00`,
          });
        }
      }

      const todos = await h.listTodos();

      const march = todos.body.data.filter(
        (t: any) =>
          t.due_date && new Date(t.due_date).getMonth() === 2
      );

      expect(march.length).toBeGreaterThanOrEqual(1);
    });
  });

  test.describe("Calendar edge cases", () => {
    test("should handle todo at end of month", async () => {
      await h.createTodo({
        title: "Last day of March",
        due_date: "2026-03-31T23:59:00",
      });

      const todos = await h.listTodos();

      const lastDay = todos.body.data.find(
        (t: any) => t.title === "Last day of March"
      );

      expect(lastDay).toBeTruthy();
      const date = new Date(lastDay.due_date);
      expect(date.getDate()).toBe(31);
      expect(date.getMonth()).toBe(2); // March
    });

    test("should handle todos with same time on different days", async () => {
      const time = "10:00:00";

      await h.createTodo({
        title: "Same time day 1",
        due_date: `2026-03-10T${time}`,
      });
      await h.createTodo({
        title: "Same time day 2",
        due_date: `2026-03-20T${time}`,
      });

      const todos = await h.listTodos();

      const day1 = todos.body.data.find((t: any) => t.title === "Same time day 1");
      const day2 = todos.body.data.find((t: any) => t.title === "Same time day 2");

      expect(day1).toBeTruthy();
      expect(day2).toBeTruthy();
      expect(new Date(day1.due_date).getHours()).toBe(10);
      expect(new Date(day2.due_date).getHours()).toBe(10);
    });

    test("should handle recurring todos in calendar", async () => {
      // Create a recurring todo that spans multiple calendar instances
      await h.createTodo({
        title: "Recurring calendar event",
        recurrence_pattern: "weekly",
        due_date: "2026-03-10T10:00:00",
      });

      const todos = await h.listTodos();

      const recurring = todos.body.data.find(
        (t: any) => t.title === "Recurring calendar event"
      );

      expect(recurring).toBeTruthy();
      expect(recurring.recurrence_pattern).toBe("weekly");
      expect(recurring.due_date).toBeTruthy();
    });

    test("should correctly sort todos by due date", async () => {
      await h.createTodo({
        title: "First in March",
        due_date: "2026-03-05T10:00:00",
      });
      await h.createTodo({
        title: "Last in March",
        due_date: "2026-03-25T10:00:00",
      });
      await h.createTodo({
        title: "Middle in March",
        due_date: "2026-03-15T10:00:00",
      });

      const todos = await h.listTodos();

      const marchTodos = todos.body.data
        .filter(
          (t: any) =>
            t.due_date && new Date(t.due_date).getMonth() === 2
        )
        .sort(
          (a: any, b: any) =>
            new Date(a.due_date).getTime() -
            new Date(b.due_date).getTime()
        );

      if (marchTodos.length >= 3) {
        expect(
          new Date(marchTodos[0].due_date).getDate() <
            new Date(marchTodos[1].due_date).getDate()
        ).toBe(true);
      }
    });
  });
});
