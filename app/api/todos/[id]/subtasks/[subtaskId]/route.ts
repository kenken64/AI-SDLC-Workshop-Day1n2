import { NextRequest, NextResponse } from "next/server";
import { subtaskDB } from "@/lib/db";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subtaskId: string }> },
) {
  try {
    const { id: rawTodoId, subtaskId: rawSubtaskId } = await params;
    const todoId = parseId(rawTodoId);
    const subtaskId = parseId(rawSubtaskId);

    if (!todoId || !subtaskId) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }

    const existing = subtaskDB.getById(subtaskId);

    if (!existing || existing.todo_id !== todoId) {
      return NextResponse.json(
        { error: "Subtask not found." },
        { status: 404 },
      );
    }

    const body = (await request.json()) as {
      title?: string;
      completed?: boolean;
      position?: number;
    };

    if (body.title !== undefined) {
      const trimmed = body.title.trim();
      if (!trimmed) {
        return NextResponse.json(
          { error: "Subtask title cannot be empty." },
          { status: 400 },
        );
      }
      if (trimmed.length > 200) {
        return NextResponse.json(
          { error: "Subtask title must be 200 characters or less." },
          { status: 400 },
        );
      }
      body.title = trimmed;
    }

    if (body.completed !== undefined && typeof body.completed !== "boolean") {
      return NextResponse.json(
        { error: "Completed must be a boolean." },
        { status: 400 },
      );
    }

    if (
      body.position !== undefined &&
      (!Number.isInteger(body.position) || body.position < 0)
    ) {
      return NextResponse.json(
        { error: "Position must be a non-negative integer." },
        { status: 400 },
      );
    }

    const updated = subtaskDB.update(subtaskId, body);

    if (!updated) {
      return NextResponse.json(
        { error: "Failed to update subtask." },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to update subtask." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; subtaskId: string }> },
) {
  try {
    const { id: rawTodoId, subtaskId: rawSubtaskId } = await params;
    const todoId = parseId(rawTodoId);
    const subtaskId = parseId(rawSubtaskId);

    if (!todoId || !subtaskId) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }

    const existing = subtaskDB.getById(subtaskId);

    if (!existing || existing.todo_id !== todoId) {
      return NextResponse.json(
        { error: "Subtask not found." },
        { status: 404 },
      );
    }

    subtaskDB.delete(subtaskId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete subtask." },
      { status: 500 },
    );
  }
}
