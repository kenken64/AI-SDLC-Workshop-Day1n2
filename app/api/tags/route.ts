import { NextRequest, NextResponse } from "next/server";
import { tagDB } from "@/lib/db";

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export async function GET() {
  try {
    const tags = tagDB.list();
    return NextResponse.json({ data: tags }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to load tags." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string;
      color?: string;
    };

    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json(
        { error: "Tag name is required." },
        { status: 400 },
      );
    }

    if (name.length > 50) {
      return NextResponse.json(
        { error: "Tag name must be 50 characters or less." },
        { status: 400 },
      );
    }

    const color = body.color ?? "#6B7280";

    if (!HEX_COLOR_RE.test(color)) {
      return NextResponse.json(
        { error: "Color must be a valid hex color (e.g. #FF5733)." },
        { status: 400 },
      );
    }

    if (tagDB.getByName(name)) {
      return NextResponse.json(
        { error: "A tag with this name already exists." },
        { status: 409 },
      );
    }

    const tag = tagDB.create(name, color);
    return NextResponse.json({ data: tag }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create tag." },
      { status: 500 },
    );
  }
}
