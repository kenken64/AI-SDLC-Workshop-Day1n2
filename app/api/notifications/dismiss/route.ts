import { NextRequest, NextResponse } from "next/server";
import { todoDB } from "@/lib/db";
import { getSingaporeNow, toSingaporeIso } from "@/lib/timezone";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { todo_id?: number };

    if (!body.todo_id || !Number.isInteger(body.todo_id) || body.todo_id <= 0) {
      return NextResponse.json(
        { error: "Valid todo_id is required." },
        { status: 400 },
      );
    }

    const nowIso = toSingaporeIso(getSingaporeNow());
    const dismissed = todoDB.dismissReminder(body.todo_id, nowIso);

    if (!dismissed) {
      return NextResponse.json(
        { error: "Todo not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to dismiss notification." },
      { status: 500 },
    );
  }
}
