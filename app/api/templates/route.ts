import { NextRequest, NextResponse } from "next/server";
import { templateDB, type Priority } from "@/lib/db";
import { getSingaporeNow, toSingaporeIso } from "@/lib/timezone";

type TemplateBody = {
  title?: string;
  description?: string | null;
  priority?: Priority;
  subtasks?: { title: string; position: number }[];
  due_date_offset_days?: number | null;
};

function validateTemplatePayload(body: TemplateBody): string | null {
  if (body.title !== undefined) {
    const trimmed = body.title.trim();
    if (!trimmed) return "Title is required.";
    if (trimmed.length > 120) return "Title must be 120 characters or less.";
  }

  if (body.description !== undefined && body.description !== null) {
    if (body.description.length > 500)
      return "Description must be 500 characters or less.";
  }

  if (
    body.priority !== undefined &&
    !["high", "medium", "low"].includes(body.priority)
  ) {
    return "Priority must be high, medium, or low.";
  }

  if (body.due_date_offset_days !== undefined && body.due_date_offset_days !== null) {
    if (
      !Number.isInteger(body.due_date_offset_days) ||
      body.due_date_offset_days < 0
    ) {
      return "Due date offset must be a non-negative integer.";
    }
  }

  if (body.subtasks !== undefined) {
    if (!Array.isArray(body.subtasks)) return "Subtasks must be an array.";
    if (body.subtasks.length > 20) return "Maximum 20 subtasks per template.";
    for (const s of body.subtasks) {
      if (!s.title?.trim()) return "Each subtask must have a title.";
      if (s.title.length > 200)
        return "Subtask title must be 200 characters or less.";
      if (!Number.isInteger(s.position) || s.position < 0)
        return "Subtask position must be a non-negative integer.";
    }
  }

  return null;
}

export async function GET() {
  try {
    const templates = templateDB.list();
    return NextResponse.json({ data: templates }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to load templates." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TemplateBody;

    if (!body.title?.trim()) {
      return NextResponse.json(
        { error: "Title is required." },
        { status: 400 },
      );
    }

    const validationError = validateTemplatePayload(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const nowIso = toSingaporeIso(getSingaporeNow());
    const template = templateDB.create(
      {
        title: body.title!.trim(),
        description: body.description?.trim() ?? null,
        priority: body.priority ?? "medium",
        subtasks: body.subtasks?.map((s) => ({
          title: s.title.trim(),
          position: s.position,
        })),
        due_date_offset_days: body.due_date_offset_days ?? null,
      },
      nowIso,
    );

    return NextResponse.json({ data: template }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create template." },
      { status: 500 },
    );
  }
}
