import { NextRequest, NextResponse } from "next/server";
import { todoDB, tagDB } from "@/lib/db";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;
    const todoId = parseId(rawId);

    if (!todoId) {
      return NextResponse.json({ error: "Invalid todo id." }, { status: 400 });
    }

    if (!todoDB.getById(todoId)) {
      return NextResponse.json({ error: "Todo not found." }, { status: 404 });
    }

    const body = (await request.json()) as { tag_id?: number };

    if (
      !body.tag_id ||
      !Number.isInteger(body.tag_id) ||
      body.tag_id <= 0
    ) {
      return NextResponse.json(
        { error: "Valid tag_id is required." },
        { status: 400 },
      );
    }

    if (!tagDB.getById(body.tag_id)) {
      return NextResponse.json({ error: "Tag not found." }, { status: 404 });
    }

    tagDB.addToTodo(todoId, body.tag_id);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to add tag to todo." },
      { status: 500 },
    );
  }
}
