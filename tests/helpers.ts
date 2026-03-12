import { APIRequestContext } from "@playwright/test";

const BASE = "http://localhost:3000";

export class TestHelpers {
  constructor(public request: APIRequestContext) {}

  async createTodo(data: {
    title: string;
    description?: string;
    priority?: string;
    due_date?: string;
    recurrence_pattern?: string | null;
    reminder_minutes?: number | null;
  }) {
    const res = await this.request.post(`${BASE}/api/todos`, { data });
    return { response: res, body: await res.json() };
  }

  async listTodos() {
    const res = await this.request.get(`${BASE}/api/todos`);
    return { response: res, body: await res.json() };
  }

  async updateTodo(id: number, data: Record<string, unknown>) {
    const res = await this.request.put(`${BASE}/api/todos/${id}`, { data });
    return { response: res, body: await res.json() };
  }

  async deleteTodo(id: number) {
    const res = await this.request.delete(`${BASE}/api/todos/${id}`);
    return { response: res, body: await res.json() };
  }

  async createSubtask(todoId: number, title: string) {
    const res = await this.request.post(
      `${BASE}/api/todos/${todoId}/subtasks`,
      { data: { title } },
    );
    return { response: res, body: await res.json() };
  }

  async listSubtasks(todoId: number) {
    const res = await this.request.get(
      `${BASE}/api/todos/${todoId}/subtasks`,
    );
    return { response: res, body: await res.json() };
  }

  async updateSubtask(
    todoId: number,
    subtaskId: number,
    data: Record<string, unknown>,
  ) {
    const res = await this.request.put(
      `${BASE}/api/todos/${todoId}/subtasks/${subtaskId}`,
      { data },
    );
    return { response: res, body: await res.json() };
  }

  async deleteSubtask(todoId: number, subtaskId: number) {
    const res = await this.request.delete(
      `${BASE}/api/todos/${todoId}/subtasks/${subtaskId}`,
    );
    return { response: res, body: await res.json() };
  }

  async createTag(name: string, color?: string) {
    const data: Record<string, string> = { name };
    if (color) data.color = color;
    const res = await this.request.post(`${BASE}/api/tags`, { data });
    return { response: res, body: await res.json() };
  }

  async listTags() {
    const res = await this.request.get(`${BASE}/api/tags`);
    return { response: res, body: await res.json() };
  }

  async updateTag(id: number, data: Record<string, unknown>) {
    const res = await this.request.put(`${BASE}/api/tags/${id}`, { data });
    return { response: res, body: await res.json() };
  }

  async deleteTag(id: number) {
    const res = await this.request.delete(`${BASE}/api/tags/${id}`);
    return { response: res, body: await res.json() };
  }

  async addTagToTodo(todoId: number, tagId: number) {
    const res = await this.request.post(`${BASE}/api/todos/${todoId}/tags`, {
      data: { tag_id: tagId },
    });
    return { response: res, body: await res.json() };
  }

  async removeTagFromTodo(todoId: number, tagId: number) {
    const res = await this.request.delete(
      `${BASE}/api/todos/${todoId}/tags/${tagId}`,
    );
    return { response: res, body: await res.json() };
  }

  async createTemplate(data: {
    title: string;
    description?: string;
    priority?: string;
    subtasks?: { title: string; position: number }[];
    due_date_offset_days?: number | null;
  }) {
    const res = await this.request.post(`${BASE}/api/templates`, { data });
    return { response: res, body: await res.json() };
  }

  async listTemplates() {
    const res = await this.request.get(`${BASE}/api/templates`);
    return { response: res, body: await res.json() };
  }

  async updateTemplate(id: number, data: Record<string, unknown>) {
    const res = await this.request.put(`${BASE}/api/templates/${id}`, {
      data,
    });
    return { response: res, body: await res.json() };
  }

  async deleteTemplate(id: number) {
    const res = await this.request.delete(`${BASE}/api/templates/${id}`);
    return { response: res, body: await res.json() };
  }

  async useTemplate(id: number) {
    const res = await this.request.post(`${BASE}/api/templates/${id}/use`);
    return { response: res, body: await res.json() };
  }

  async checkNotifications() {
    const res = await this.request.get(`${BASE}/api/notifications/check`);
    return { response: res, body: await res.json() };
  }

  async dismissNotification(todoId: number) {
    const res = await this.request.post(`${BASE}/api/notifications/dismiss`, {
      data: { todo_id: todoId },
    });
    return { response: res, body: await res.json() };
  }
}
