import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";

import { badRequestResponse, serverErrorResponse } from "@/lib/api";
import { authenticatorDB, userDB } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { username?: string };
    const username = body.username?.trim();

    if (!username) {
      return badRequestResponse("Username is required");
    }

    let user = userDB.findByUsername(username);
    if (!user) {
      user = userDB.create(username);
    }

    const existingAuthenticators = authenticatorDB.listByUserId(user.id);

    const options = await generateRegistrationOptions({
      rpName: process.env.RP_NAME || "Todo App",
      rpID: process.env.RP_ID || "localhost",
      userName: user.username,
      userID: new TextEncoder().encode(user.id),
      attestationType: "none",
      excludeCredentials: existingAuthenticators.map((authenticator) => ({
        id: authenticator.credential_id,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    userDB.saveChallenge(user.id, options.challenge);

    return NextResponse.json({
      success: true,
      options,
      username: user.username,
    });
  } catch {
    return serverErrorResponse();
  }
}
