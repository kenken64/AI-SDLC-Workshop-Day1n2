import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { userDB, authenticatorDB } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { toSingaporeIso, getSingaporeNow } from "@/lib/timezone";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, response } = body as {
      username?: string;
      response?: unknown;
    };

    if (!username || !response) {
      return NextResponse.json(
        { error: "Username and response are required." },
        { status: 400 },
      );
    }

    const user = userDB.getByUsername(username.trim());

    if (!user || !user.current_challenge) {
      return NextResponse.json(
        { error: "Registration challenge not found. Please try again." },
        { status: 400 },
      );
    }

    const rpID = request.headers.get("host")?.split(":")[0] ?? "localhost";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const origin = `${protocol}://${request.headers.get("host")}`;

    const verification = await verifyRegistrationResponse({
      response: response as Parameters<typeof verifyRegistrationResponse>[0]["response"],
      expectedChallenge: user.current_challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { error: "Registration verification failed." },
        { status: 400 },
      );
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    const nowIso = toSingaporeIso(getSingaporeNow());

    authenticatorDB.create(
      user.id,
      credential.id,
      isoBase64URL.fromBuffer(credential.publicKey),
      credential.counter ?? 0,
      credential.transports ? JSON.stringify(credential.transports) : null,
      nowIso,
    );

    // Clear challenge after successful registration
    userDB.setChallenge(user.id, null);

    // Create session
    await createSession(user.id, user.username);

    return NextResponse.json({
      verified: true,
      username: user.username,
    });
  } catch {
    return NextResponse.json(
      { error: "Registration verification failed." },
      { status: 500 },
    );
  }
}
