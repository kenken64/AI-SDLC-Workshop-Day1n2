import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { userDB, authenticatorDB } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { username } = (await request.json()) as { username?: string };

    if (!username || !username.trim()) {
      return NextResponse.json(
        { error: "Username is required." },
        { status: 400 },
      );
    }

    const user = userDB.getByUsername(username.trim());

    if (!user) {
      return NextResponse.json(
        { error: "User not found. Please register first." },
        { status: 404 },
      );
    }

    const userAuths = authenticatorDB.getByUserId(user.id);

    if (userAuths.length === 0) {
      return NextResponse.json(
        { error: "No passkeys found. Please register first." },
        { status: 404 },
      );
    }

    const rpID = request.headers.get("host")?.split(":")[0] ?? "localhost";

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: userAuths.map((auth) => ({
        id: auth.credential_id,
        transports: auth.transports
          ? (JSON.parse(auth.transports) as AuthenticatorTransport[])
          : undefined,
      })),
      userVerification: "preferred",
    });

    userDB.setChallenge(user.id, options.challenge);

    return NextResponse.json(options);
  } catch {
    return NextResponse.json(
      { error: "Failed to generate login options." },
      { status: 500 },
    );
  }
}
