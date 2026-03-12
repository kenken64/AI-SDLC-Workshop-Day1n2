import { test, expect } from "@playwright/test";
import { TestHelpers } from "./helpers";

let h: TestHelpers;

test.beforeAll(async ({ request }) => {
  // Clear all tags (and associated data) so unique name constraints pass on re-runs
  await request.post("http://localhost:3000/api/test-reset");
});

test.beforeEach(async ({ request }) => {
  h = new TestHelpers(request);
});

test.describe("PRP 06: Tag System", () => {
  test.describe("Creating tags", () => {
    test("should create a tag with name and default color", async () => {
      const { response, body } = await h.createTag("Work");

      expect(response.status()).toBe(201);
      expect(body.data.name).toBe("Work");
      expect(body.data.color).toBe("#6B7280");
      expect(body.data.id).toBeDefined();
    });

    test("should create a tag with custom color", async () => {
      const { response, body } = await h.createTag("Urgent", "#EF4444");

      expect(response.status()).toBe(201);
      expect(body.data.name).toBe("Urgent");
      expect(body.data.color).toBe("#EF4444");
    });

    test("should reject duplicate tag name (case-insensitive)", async () => {
      await h.createTag("Duplicate");

      const { response, body } = await h.createTag("duplicate");

      expect(response.status()).toBe(409);
      expect(body.error).toContain("already exists");
    });

    test("should return 400 for empty tag name", async () => {
      const { response, body } = await h.createTag("");

      expect(response.status()).toBe(400);
      expect(body.error).toContain("name is required");
    });

    test("should return 400 for whitespace-only tag name", async () => {
      const { response } = await h.createTag("   ");

      expect(response.status()).toBe(400);
    });

    test("should return 400 for tag name over 50 characters", async () => {
      const longName = "a".repeat(51);
      const { response, body } = await h.createTag(longName);

      expect(response.status()).toBe(400);
      expect(body.error).toContain("50 characters");
    });

    test("should accept tag name exactly 50 characters", async () => {
      const exactName = "b".repeat(50);
      const { response, body } = await h.createTag(exactName);

      expect(response.status()).toBe(201);
      expect(body.data.name).toBe(exactName);
    });

    test("should return 400 for invalid hex color", async () => {
      const { response, body } = await h.createTag("Invalid color", "red");

      expect(response.status()).toBe(400);
      expect(body.error).toContain("hex color");
    });

    test("should return 400 for short hex color", async () => {
      const { response } = await h.createTag("Short hex", "#FFF");

      expect(response.status()).toBe(400);
    });
  });

  test.describe("Listing tags", () => {
    test("should list all tags ordered by name", async () => {
      await h.createTag("Zebra", "#EF4444");
      await h.createTag("Alpha", "#3B82F6");

      const { response, body } = await h.listTags();

      expect(response.status()).toBe(200);
      expect(body.data).toBeInstanceOf(Array);

      const names = body.data.map((t: { name: string }) => t.name);
      const sortedNames = [...names].sort();
      expect(names).toEqual(sortedNames);
    });
  });

  test.describe("Updating tags", () => {
    test("should update tag name", async () => {
      const { body: created } = await h.createTag("OldName");

      const { response, body } = await h.updateTag(created.data.id, {
        name: "NewName",
      });

      expect(response.status()).toBe(200);
      expect(body.data.name).toBe("NewName");
    });

    test("should update tag color", async () => {
      const { body: created } = await h.createTag("ColorChange");

      const { response, body } = await h.updateTag(created.data.id, {
        color: "#22C55E",
      });

      expect(response.status()).toBe(200);
      expect(body.data.color).toBe("#22C55E");
    });

    test("should reject duplicate name on update", async () => {
      await h.createTag("ExistingTag");
      const { body: second } = await h.createTag("SecondTag");

      const { response, body } = await h.updateTag(second.data.id, {
        name: "ExistingTag",
      });

      expect(response.status()).toBe(409);
      expect(body.error).toContain("already exists");
    });

    test("should return 404 for non-existent tag", async () => {
      const { response } = await h.updateTag(999999, { name: "Ghost" });
      expect(response.status()).toBe(404);
    });

    test("should return 400 for empty name on update", async () => {
      const { body: created } = await h.createTag("EmptyUpdate");

      const { response } = await h.updateTag(created.data.id, { name: "  " });
      expect(response.status()).toBe(400);
    });

    test("should return 400 for invalid color on update", async () => {
      const { body: created } = await h.createTag("BadColor");

      const { response } = await h.updateTag(created.data.id, {
        color: "notahex",
      });
      expect(response.status()).toBe(400);
    });

    test("should allow updating tag to its own name", async () => {
      const { body: created } = await h.createTag("SelfUpdate");

      const { response, body } = await h.updateTag(created.data.id, {
        name: "SelfUpdate",
      });

      expect(response.status()).toBe(200);
      expect(body.data.name).toBe("SelfUpdate");
    });
  });

  test.describe("Deleting tags", () => {
    test("should delete an existing tag", async () => {
      const { body: created } = await h.createTag("DeleteMe");

      const { response, body } = await h.deleteTag(created.data.id);

      expect(response.status()).toBe(200);
      expect(body.success).toBe(true);
    });

    test("should return 404 for non-existent tag", async () => {
      const { response } = await h.deleteTag(999999);
      expect(response.status()).toBe(404);
    });
  });

  test.describe("Todo-Tag associations", () => {
    test("should add a tag to a todo", async () => {
      const { body: todo } = await h.createTodo({ title: "Tagged todo" });
      const { body: tag } = await h.createTag("AssignTag");

      const { response, body } = await h.addTagToTodo(
        todo.data.id,
        tag.data.id,
      );

      expect(response.status()).toBe(201);
      expect(body.success).toBe(true);
    });

    test("should be idempotent when adding same tag twice", async () => {
      const { body: todo } = await h.createTodo({ title: "Idempotent todo" });
      const { body: tag } = await h.createTag("IdempotentTag");

      await h.addTagToTodo(todo.data.id, tag.data.id);
      const { response, body } = await h.addTagToTodo(
        todo.data.id,
        tag.data.id,
      );

      expect(response.status()).toBe(201);
      expect(body.success).toBe(true);
    });

    test("should return 404 when adding tag to non-existent todo", async () => {
      const { body: tag } = await h.createTag("NoTodoTag");

      const { response } = await h.addTagToTodo(999999, tag.data.id);
      expect(response.status()).toBe(404);
    });

    test("should return 404 when adding non-existent tag to todo", async () => {
      const { body: todo } = await h.createTodo({
        title: "No tag todo",
      });

      const { response } = await h.addTagToTodo(todo.data.id, 999999);
      expect(response.status()).toBe(404);
    });

    test("should return 400 for invalid tag_id", async () => {
      const { body: todo } = await h.createTodo({
        title: "Invalid tag_id",
      });

      const res = await h.request.post(
        `http://localhost:3000/api/todos/${todo.data.id}/tags`,
        { data: { tag_id: -1 } },
      );
      expect(res.status()).toBe(400);
    });

    test("should remove a tag from a todo", async () => {
      const { body: todo } = await h.createTodo({ title: "Remove tag todo" });
      const { body: tag } = await h.createTag("RemoveTag");
      await h.addTagToTodo(todo.data.id, tag.data.id);

      const { response, body } = await h.removeTagFromTodo(
        todo.data.id,
        tag.data.id,
      );

      expect(response.status()).toBe(200);
      expect(body.success).toBe(true);
    });

    test("should return 404 when removing non-existent association", async () => {
      const { body: todo } = await h.createTodo({
        title: "No association",
      });
      const { body: tag } = await h.createTag("NoAssocTag");

      const { response } = await h.removeTagFromTodo(
        todo.data.id,
        tag.data.id,
      );
      expect(response.status()).toBe(404);
    });
  });

  test.describe("CASCADE behavior", () => {
    test("should remove tag associations when tag is deleted", async () => {
      const { body: todo } = await h.createTodo({ title: "Cascade tag todo" });
      const { body: tag } = await h.createTag("CascadeTag");
      await h.addTagToTodo(todo.data.id, tag.data.id);

      await h.deleteTag(tag.data.id);

      // Trying to remove association should 404 since it's gone
      const { response } = await h.removeTagFromTodo(
        todo.data.id,
        tag.data.id,
      );
      expect(response.status()).toBe(404);
    });

    test("should remove tag associations when todo is deleted", async () => {
      const { body: todo } = await h.createTodo({
        title: "Delete todo cascade",
      });
      const { body: tag } = await h.createTag("CascadeTodoTag");
      await h.addTagToTodo(todo.data.id, tag.data.id);

      await h.deleteTodo(todo.data.id);

      // Tag should still exist
      const { body: tags } = await h.listTags();
      const found = tags.data.find(
        (t: { id: number }) => t.id === tag.data.id,
      );
      expect(found).toBeDefined();
    });
  });
});
