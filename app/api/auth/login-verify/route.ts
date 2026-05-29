import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import { badRequestResponse, serverErrorResponse } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { authenticatorDB, userDB } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      username?: string;
      response?: {
        id: string;
      };
    };

    const username = body.username?.trim();
    if (!username || !body.response) {
      return badRequestResponse("Username and login response are required");
    }

    const user = userDB.findByUsername(username);
    if (!user || !user.current_challenge) {
      return badRequestResponse("No login challenge found");
    }

    if (user.challenge_expires_at && new Date(user.challenge_expires_at).getTime() < Date.now()) {
      userDB.clearChallenge(user.id);
      return badRequestResponse("Login challenge has expired");
    }

    const authenticator = authenticatorDB.findByCredentialId(body.response.id);
    if (!authenticator) {
      return badRequestResponse("Authenticator not found");
    }

    if (authenticator.user_id !== user.id) {
      return badRequestResponse("Authenticator does not belong to user");
    }

    const parsedTransports = authenticator.transports
      ? (JSON.parse(authenticator.transports) as NonNullable<
          NonNullable<Parameters<typeof verifyAuthenticationResponse>[0]["credential"]>["transports"]
        >)
      : undefined;

    const verification = await verifyAuthenticationResponse({
      response: body.response as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
      expectedChallenge: user.current_challenge,
      expectedOrigin: process.env.RP_ORIGIN || "http://localhost:3000",
      expectedRPID: process.env.RP_ID || "localhost",
      credential: {
        id: authenticator.credential_id,
        publicKey: isoBase64URL.toBuffer(authenticator.public_key),
        counter: authenticator.counter ?? 0,
        transports: parsedTransports,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return badRequestResponse("Authentication failed");
    }

    const nextCounter = verification.authenticationInfo.newCounter;
    authenticatorDB.updateCounter(authenticator.id, nextCounter);
    userDB.clearChallenge(user.id);

    await createSession({
      userId: user.id,
      username: user.username,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
      },
    });
  } catch {
    return serverErrorResponse();
  }
}
