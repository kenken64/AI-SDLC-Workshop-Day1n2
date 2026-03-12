import { NextResponse } from "next/server";
import { todoDB, subtaskDB } from "@/lib/db";

export async function GET() {
  try {
    const todos = todoDB.list();
    const todosWithSubtasks = todos.map((todo) => ({
      ...todo,
      subtasks: subtaskDB.listByTodo(todo.id),
    }));

    return NextResponse.json(
      { success: true, data: { todos: todosWithSubtasks } },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to export todos." },
      { status: 500 },
    );
  }
}
