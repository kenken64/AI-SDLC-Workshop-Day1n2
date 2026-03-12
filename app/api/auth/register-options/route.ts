import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { userDB, authenticatorDB } from "@/lib/db";
import { toSingaporeIso, getSingaporeNow } from "@/lib/timezone";

export async function POST(request: NextRequest) {
  try {
    const { username } = (await request.json()) as { username?: string };

    if (!username || !username.trim()) {
      return NextResponse.json(
        { error: "Username is required." },
        { status: 400 },
      );
    }

    const trimmed = username.trim();
    const rpID = request.headers.get("host")?.split(":")[0] ?? "localhost";

    let user = userDB.getByUsername(trimmed);

    if (user) {
      // User exists — check if they already have authenticators
      const existingAuths = authenticatorDB.getByUserId(user.id);

      if (existingAuths.length > 0) {
        return NextResponse.json(
          { error: "Username already registered. Please login instead." },
          { status: 409 },
        );
      }
    } else {
      const nowIso = toSingaporeIso(getSingaporeNow());
      user = userDB.create(trimmed, nowIso);
    }

    const existingAuths = authenticatorDB.getByUserId(user.id);

    const options = await generateRegistrationOptions({
      rpName: "Todo App",
      rpID,
      userID: new TextEncoder().encode(String(user.id)),
      userName: user.username,
      attestationType: "none",
      excludeCredentials: existingAuths.map((auth) => ({
        id: auth.credential_id,
        transports: auth.transports
          ? (JSON.parse(auth.transports) as AuthenticatorTransport[])
          : undefined,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    userDB.setChallenge(user.id, options.challenge);

    return NextResponse.json(options);
  } catch {
    return NextResponse.json(
      { error: "Failed to generate registration options." },
      { status: 500 },
    );
  }
}
