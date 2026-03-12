import { NextRequest, NextResponse } from "next/server";
import { templateDB, type Priority } from "@/lib/db";
import { getSingaporeNow, toSingaporeIso } from "@/lib/timezone";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;
    const id = parseId(rawId);

    if (!id) {
      return NextResponse.json(
        { error: "Invalid template id." },
        { status: 400 },
      );
    }

    const body = (await request.json()) as {
      title?: string;
      description?: string | null;
      priority?: Priority;
      subtasks?: { title: string; position: number }[];
      due_date_offset_days?: number | null;
    };

    if (body.title !== undefined) {
      const trimmed = body.title.trim();
      if (!trimmed) {
        return NextResponse.json(
          { error: "Title cannot be empty." },
          { status: 400 },
        );
      }
      if (trimmed.length > 120) {
        return NextResponse.json(
          { error: "Title must be 120 characters or less." },
          { status: 400 },
        );
      }
      body.title = trimmed;
    }

    if (body.description !== undefined && body.description !== null) {
      if (body.description.length > 500) {
        return NextResponse.json(
          { error: "Description must be 500 characters or less." },
          { status: 400 },
        );
      }
    }

    if (
      body.priority !== undefined &&
      !["high", "medium", "low"].includes(body.priority)
    ) {
      return NextResponse.json(
        { error: "Priority must be high, medium, or low." },
        { status: 400 },
      );
    }

    if (body.subtasks !== undefined) {
      if (!Array.isArray(body.subtasks)) {
        return NextResponse.json(
          { error: "Subtasks must be an array." },
          { status: 400 },
        );
      }
      if (body.subtasks.length > 20) {
        return NextResponse.json(
          { error: "Maximum 20 subtasks per template." },
          { status: 400 },
        );
      }
      for (const s of body.subtasks) {
        if (!s.title?.trim()) {
          return NextResponse.json(
            { error: "Each subtask must have a title." },
            { status: 400 },
          );
        }
        if (s.title.length > 200) {
          return NextResponse.json(
            { error: "Subtask title must be 200 characters or less." },
            { status: 400 },
          );
        }
      }
    }

    const nowIso = toSingaporeIso(getSingaporeNow());
    const template = templateDB.update(
      id,
      {
        title: body.title,
        description:
          body.description === undefined ? undefined : body.description,
        priority: body.priority,
        subtasks: body.subtasks?.map((s) => ({
          title: s.title.trim(),
          position: s.position,
        })),
        due_date_offset_days:
          body.due_date_offset_days === undefined
            ? undefined
            : body.due_date_offset_days,
      },
      nowIso,
    );

    if (!template) {
      return NextResponse.json(
        { error: "Template not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: template }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to update template." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;
    const id = parseId(rawId);

    if (!id) {
      return NextResponse.json(
        { error: "Invalid template id." },
        { status: 400 },
      );
    }

    const deleted = templateDB.delete(id);

    if (!deleted) {
      return NextResponse.json(
        { error: "Template not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete template." },
      { status: 500 },
    );
  }
}
