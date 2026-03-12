import { NextResponse } from "next/server";
import { todoDB } from "@/lib/db";
import { getSingaporeNow, toSingaporeIso } from "@/lib/timezone";

export async function GET() {
  try {
    const nowIso = toSingaporeIso(getSingaporeNow());
    const dueTodos = todoDB.getDueReminders(nowIso);
    return NextResponse.json({ data: dueTodos }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to check notifications." },
      { status: 500 },
    );
  }
}
