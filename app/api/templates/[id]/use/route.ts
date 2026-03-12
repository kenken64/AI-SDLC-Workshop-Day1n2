import { NextRequest, NextResponse } from "next/server";
import {
  templateDB,
  todoDB,
  subtaskDB,
  type TemplateSubtask,
} from "@/lib/db";
import { getSingaporeNow, toSingaporeIso } from "@/lib/timezone";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(
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

    const template = templateDB.getById(id);

    if (!template) {
      return NextResponse.json(
        { error: "Template not found." },
        { status: 404 },
      );
    }

    const now = getSingaporeNow();
    const nowIso = toSingaporeIso(now);

    let dueDate: string | null = null;
    if (
      template.due_date_offset_days !== null &&
      template.due_date_offset_days >= 0
    ) {
      const due = new Date(now.getTime());
      due.setDate(due.getDate() + template.due_date_offset_days);
      dueDate = toSingaporeIso(due);
    }

    const todo = todoDB.create(
      {
        title: template.title,
        description: template.description,
        priority: template.priority,
        due_date: dueDate,
      },
      nowIso,
    );

    // Create subtasks from template
    let subtasks: TemplateSubtask[] = [];
    try {
      subtasks = JSON.parse(template.subtasks_json) as TemplateSubtask[];
    } catch {
      // Invalid JSON — skip subtask creation
    }

    for (const s of subtasks) {
      subtaskDB.create(todo.id, s.title, nowIso);
    }

    return NextResponse.json({ data: todo }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to use template." },
      { status: 500 },
    );
  }
}
