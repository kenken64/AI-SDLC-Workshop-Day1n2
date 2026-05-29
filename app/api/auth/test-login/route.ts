import { NextResponse } from "next/server";

import { createSession } from "@/lib/auth";
import { userDB } from "@/lib/db";

export async function POST() {
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_TEST_LOGIN !== "true") {
    return NextResponse.json(
      {
        success: false,
        error: "Not available",
      },
      { status: 404 },
    );
  }

  const username = "e2e-user";
  let user = userDB.findByUsername(username);
  if (!user) {
    user = userDB.create(username);
  }

  await createSession({
    userId: user.id,
    username: user.username,
  });

  return NextResponse.json({
    success: true,
  });
}
