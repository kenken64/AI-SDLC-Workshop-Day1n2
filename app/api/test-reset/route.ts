import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "node:path";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 403 },
    );
  }

  const db = new Database(path.join(process.cwd(), "todos.db"));
  db.pragma("foreign_keys = ON");

  db.exec("DELETE FROM todo_tags");
  db.exec("DELETE FROM subtasks");
  db.exec("DELETE FROM todos");
  db.exec("DELETE FROM tags");
  db.exec("DELETE FROM templates");
  db.exec("DELETE FROM authenticators");
  db.exec("DELETE FROM users");

  db.close();

  return NextResponse.json({ success: true });
}
