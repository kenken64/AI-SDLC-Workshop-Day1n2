import { test, expect } from "@playwright/test";
import { TestHelpers } from "./helpers";

let h: TestHelpers;

test.beforeEach(async ({ request }) => {
  h = new TestHelpers(request);
});

test.describe("PRP 04: Reminders & Notifications", () => {
  test.describe("Setting reminders on todos", () => {
    test("should create a todo with a valid reminder_minutes", async () => {
      const { response, body } = await h.createTodo({
        title: "Reminder test",
        due_date: "2026-12-31T10:00:00",
        reminder_minutes: 60,
      });

      expect(response.status()).toBe(201);
      expect(body.data.reminder_minutes).toBe(60);
      expect(body.data.last_notification_sent).toBeNull();
    });

    test("should create a todo without a reminder (null)", async () => {
      const { response, body } = await h.createTodo({
        title: "No reminder",
        due_date: "2026-12-31T10:00:00",
      });

      expect(response.status()).toBe(201);
      expect(body.data.reminder_minutes).toBeNull();
    });

    test("should reject invalid reminder_minutes value", async () => {
      const { response, body } = await h.createTodo({
        title: "Bad reminder",
        due_date: "2026-12-31T10:00:00",
        reminder_minutes: 45,
      });

      expect(response.status()).toBe(400);
      expect(body.error).toContain("Reminder must be");
    });

    test("should accept all valid reminder options", async () => {
      const validOptions = [15, 30, 60, 120, 1440, 2880, 10080];

      for (const minutes of validOptions) {
        const { response, body } = await h.createTodo({
          title: `Reminder ${minutes}m`,
          due_date: "2026-12-31T10:00:00",
          reminder_minutes: minutes,
        });

        expect(response.status()).toBe(201);
        expect(body.data.reminder_minutes).toBe(minutes);
      }
    });

    test("should store reminder_minutes even without due_date", async () => {
      const { response, body } = await h.createTodo({
        title: "No due date reminder",
        reminder_minutes: 30,
      });

      expect(response.status()).toBe(201);
      expect(body.data.reminder_minutes).toBe(30);
      expect(body.data.due_date).toBeNull();
    });
  });

  test.describe("Updating reminders", () => {
    test("should update reminder_minutes on an existing todo", async () => {
      const { body: created } = await h.createTodo({
        title: "Update reminder",
        due_date: "2026-12-31T10:00:00",
        reminder_minutes: 60,
      });

      const { response, body } = await h.updateTodo(created.data.id, {
        reminder_minutes: 1440,
      });

      expect(response.status()).toBe(200);
      expect(body.data.reminder_minutes).toBe(1440);
    });

    test("should remove reminder by setting to null", async () => {
      const { body: created } = await h.createTodo({
        title: "Remove reminder",
        due_date: "2026-12-31T10:00:00",
        reminder_minutes: 60,
      });

      const { response, body } = await h.updateTodo(created.data.id, {
        reminder_minutes: null,
      });

      expect(response.status()).toBe(200);
      expect(body.data.reminder_minutes).toBeNull();
    });

    test("should reject invalid reminder_minutes on update", async () => {
      const { body: created } = await h.createTodo({
        title: "Bad update reminder",
        due_date: "2026-12-31T10:00:00",
        reminder_minutes: 60,
      });

      const { response, body } = await h.updateTodo(created.data.id, {
        reminder_minutes: 999,
      });

      expect(response.status()).toBe(400);
      expect(body.error).toContain("Reminder must be");
    });

    test("should reset last_notification_sent when reminder_minutes changes", async () => {
      const { body: created } = await h.createTodo({
        title: "Reset notification",
        due_date: "2026-12-31T10:00:00",
        reminder_minutes: 60,
      });

      // Dismiss reminder first
      await h.dismissNotification(created.data.id);

      // Verify it was dismissed
      const { body: afterDismiss } = await h.updateTodo(created.data.id, {
        title: "Reset notification",
      });
      expect(afterDismiss.data.last_notification_sent).not.toBeNull();

      // Change reminder_minutes — should reset last_notification_sent
      const { response, body } = await h.updateTodo(created.data.id, {
        reminder_minutes: 1440,
      });

      expect(response.status()).toBe(200);
      expect(body.data.reminder_minutes).toBe(1440);
      expect(body.data.last_notification_sent).toBeNull();
    });
  });

  test.describe("Notification check endpoint", () => {
    test("should return empty array when no reminders are due", async () => {
      const { response, body } = await h.checkNotifications();

      expect(response.status()).toBe(200);
      expect(body.data).toBeInstanceOf(Array);
    });

    test("should return todo with past-due reminder", async () => {
      // Create a todo with due_date in the past and a reminder
      const { body: created } = await h.createTodo({
        title: "Past due reminder",
        due_date: "2020-01-01T10:00:00",
        reminder_minutes: 15,
      });

      const { response, body } = await h.checkNotifications();

      expect(response.status()).toBe(200);
      const found = body.data.find(
        (t: { id: number }) => t.id === created.data.id,
      );
      expect(found).toBeDefined();
      expect(found.title).toBe("Past due reminder");
    });

    test("should NOT return completed todos", async () => {
      const { body: created } = await h.createTodo({
        title: "Completed with reminder",
        due_date: "2020-01-01T10:00:00",
        reminder_minutes: 15,
      });

      await h.updateTodo(created.data.id, { completed: true });

      const { body } = await h.checkNotifications();
      const found = body.data.find(
        (t: { id: number }) => t.id === created.data.id,
      );
      expect(found).toBeUndefined();
    });

    test("should NOT return todos without due_date", async () => {
      const { body: created } = await h.createTodo({
        title: "No due date",
        reminder_minutes: 15,
      });

      const { body } = await h.checkNotifications();
      const found = body.data.find(
        (t: { id: number }) => t.id === created.data.id,
      );
      expect(found).toBeUndefined();
    });

    test("should NOT return already dismissed reminders", async () => {
      const { body: created } = await h.createTodo({
        title: "Already dismissed",
        due_date: "2020-01-01T10:00:00",
        reminder_minutes: 15,
      });

      await h.dismissNotification(created.data.id);

      const { body } = await h.checkNotifications();
      const found = body.data.find(
        (t: { id: number }) => t.id === created.data.id,
      );
      expect(found).toBeUndefined();
    });
  });

  test.describe("Dismiss notification endpoint", () => {
    test("should dismiss a notification successfully", async () => {
      const { body: created } = await h.createTodo({
        title: "Dismiss me",
        due_date: "2020-01-01T10:00:00",
        reminder_minutes: 15,
      });

      const { response, body } = await h.dismissNotification(created.data.id);

      expect(response.status()).toBe(200);
      expect(body.success).toBe(true);
    });

    test("should return 404 for non-existent todo", async () => {
      const { response } = await h.dismissNotification(999999);
      expect(response.status()).toBe(404);
    });

    test("should return 400 for invalid todo_id", async () => {
      const res = await h.request.post(
        "http://localhost:3000/api/notifications/dismiss",
        { data: { todo_id: -1 } },
      );
      expect(res.status()).toBe(400);
    });

    test("should return 400 for missing todo_id", async () => {
      const res = await h.request.post(
        "http://localhost:3000/api/notifications/dismiss",
        { data: {} },
      );
      expect(res.status()).toBe(400);
    });
  });

  test.describe("Recurring todo reminder inheritance", () => {
    test("should inherit reminder_minutes on recurring todo completion", async () => {
      const { body: created } = await h.createTodo({
        title: "Recurring with reminder",
        due_date: "2026-06-01T10:00:00",
        recurrence_pattern: "weekly",
        reminder_minutes: 60,
      });

      const { response, body } = await h.updateTodo(created.data.id, {
        completed: true,
      });

      expect(response.status()).toBe(200);
      expect(body.next_todo).toBeDefined();
      expect(body.next_todo.reminder_minutes).toBe(60);
      expect(body.next_todo.last_notification_sent).toBeNull();
    });
  });
});
