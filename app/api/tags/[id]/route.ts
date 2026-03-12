import { NextRequest, NextResponse } from "next/server";
import { tagDB } from "@/lib/db";

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

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
      return NextResponse.json({ error: "Invalid tag id." }, { status: 400 });
    }

    const body = (await request.json()) as {
      name?: string;
      color?: string;
    };

    if (body.name !== undefined) {
      const trimmed = body.name.trim();
      if (!trimmed) {
        return NextResponse.json(
          { error: "Tag name cannot be empty." },
          { status: 400 },
        );
      }
      if (trimmed.length > 50) {
        return NextResponse.json(
          { error: "Tag name must be 50 characters or less." },
          { status: 400 },
        );
      }

      const existing = tagDB.getByName(trimmed);
      if (existing && existing.id !== id) {
        return NextResponse.json(
          { error: "A tag with this name already exists." },
          { status: 409 },
        );
      }

      body.name = trimmed;
    }

    if (body.color !== undefined && !HEX_COLOR_RE.test(body.color)) {
      return NextResponse.json(
        { error: "Color must be a valid hex color (e.g. #FF5733)." },
        { status: 400 },
      );
    }

    const tag = tagDB.update(id, body);

    if (!tag) {
      return NextResponse.json({ error: "Tag not found." }, { status: 404 });
    }

    return NextResponse.json({ data: tag }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to update tag." },
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
      return NextResponse.json({ error: "Invalid tag id." }, { status: 400 });
    }

    const deleted = tagDB.delete(id);

    if (!deleted) {
      return NextResponse.json({ error: "Tag not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete tag." },
      { status: 500 },
    );
  }
}
