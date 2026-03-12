import { NextRequest, NextResponse } from "next/server";
import { todoDB, subtaskDB } from "@/lib/db";
import { getSingaporeNow, toSingaporeIso } from "@/lib/timezone";

function parseParentId(rawId: string): number | null {
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;
    const todoId = parseParentId(rawId);

    if (!todoId) {
      return NextResponse.json({ error: "Invalid todo id." }, { status: 400 });
    }

    if (!todoDB.getById(todoId)) {
      return NextResponse.json({ error: "Todo not found." }, { status: 404 });
    }

    const subtasks = subtaskDB.listByTodo(todoId);
    return NextResponse.json({ data: subtasks }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to load subtasks." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;
    const todoId = parseParentId(rawId);

    if (!todoId) {
      return NextResponse.json({ error: "Invalid todo id." }, { status: 400 });
    }

    if (!todoDB.getById(todoId)) {
      return NextResponse.json({ error: "Todo not found." }, { status: 404 });
    }

    const body = (await request.json()) as { title?: string };
    const title = body.title?.trim();

    if (!title) {
      return NextResponse.json(
        { error: "Subtask title is required." },
        { status: 400 },
      );
    }

    if (title.length > 200) {
      return NextResponse.json(
        { error: "Subtask title must be 200 characters or less." },
        { status: 400 },
      );
    }

    const nowIso = toSingaporeIso(getSingaporeNow());
    const subtask = subtaskDB.create(todoId, title, nowIso);

    return NextResponse.json({ data: subtask }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create subtask." },
      { status: 500 },
    );
  }
}
