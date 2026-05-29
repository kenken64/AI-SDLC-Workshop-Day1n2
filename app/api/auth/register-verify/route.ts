import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import { badRequestResponse, serverErrorResponse } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { authenticatorDB, userDB } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      username?: string;
      response?: unknown;
    };

    const username = body.username?.trim();
    if (!username || !body.response) {
      return badRequestResponse("Username and registration response are required");
    }

    const user = userDB.findByUsername(username);
    if (!user || !user.current_challenge) {
      return badRequestResponse("No registration challenge found");
    }

    if (user.challenge_expires_at && new Date(user.challenge_expires_at).getTime() < Date.now()) {
      userDB.clearChallenge(user.id);
      return badRequestResponse("Registration challenge has expired");
    }

    const verification = await verifyRegistrationResponse({
      response: body.response as Parameters<typeof verifyRegistrationResponse>[0]["response"],
      expectedChallenge: user.current_challenge,
      expectedOrigin: process.env.RP_ORIGIN || "http://localhost:3000",
      expectedRPID: process.env.RP_ID || "localhost",
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return badRequestResponse("Registration verification failed");
    }

    const { credential } = verification.registrationInfo;

    authenticatorDB.create({
      user_id: user.id,
      credential_id: credential.id,
      public_key: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter ?? 0,
      transports: credential.transports ? JSON.stringify(credential.transports) : null,
    });

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
