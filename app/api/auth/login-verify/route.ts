import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { userDB, authenticatorDB } from "@/lib/db";
import { createSession } from "@/lib/auth";

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
        { error: "Login challenge not found. Please try again." },
        { status: 400 },
      );
    }

    const rpID = request.headers.get("host")?.split(":")[0] ?? "localhost";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const origin = `${protocol}://${request.headers.get("host")}`;

    // Find the authenticator used
    const authResponse = response as { id?: string; rawId?: string };
    const credentialId = authResponse.id ?? authResponse.rawId ?? "";

    const authenticator = authenticatorDB.getByCredentialId(credentialId);

    if (!authenticator) {
      return NextResponse.json(
        { error: "Authenticator not found." },
        { status: 400 },
      );
    }

    const verification = await verifyAuthenticationResponse({
      response: response as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
      expectedChallenge: user.current_challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: authenticator.credential_id,
        publicKey: isoBase64URL.toBuffer(authenticator.credential_public_key),
        counter: authenticator.counter ?? 0,
        transports: authenticator.transports
          ? (JSON.parse(authenticator.transports) as AuthenticatorTransport[])
          : undefined,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return NextResponse.json(
        { error: "Login verification failed." },
        { status: 400 },
      );
    }

    // Update counter
    authenticatorDB.updateCounter(
      authenticator.id,
      verification.authenticationInfo.newCounter ?? 0,
    );

    // Clear challenge
    userDB.setChallenge(user.id, null);

    // Create session
    await createSession(user.id, user.username);

    return NextResponse.json({
      verified: true,
      username: user.username,
    });
  } catch {
    return NextResponse.json(
      { error: "Login verification failed." },
      { status: 500 },
    );
  }
}
