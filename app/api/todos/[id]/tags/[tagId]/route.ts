import { NextRequest, NextResponse } from "next/server";
import { tagDB } from "@/lib/db";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; tagId: string }> },
) {
  try {
    const { id: rawTodoId, tagId: rawTagId } = await params;
    const todoId = parseId(rawTodoId);
    const tagId = parseId(rawTagId);

    if (!todoId || !tagId) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }

    const removed = tagDB.removeFromTodo(todoId, tagId);

    if (!removed) {
      return NextResponse.json(
        { error: "Tag association not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to remove tag from todo." },
      { status: 500 },
    );
  }
}
