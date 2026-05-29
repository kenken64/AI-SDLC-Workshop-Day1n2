import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";

import { badRequestResponse, serverErrorResponse } from "@/lib/api";
import { authenticatorDB, userDB } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { username?: string };
    const username = body.username?.trim();

    if (!username) {
      return badRequestResponse("Username is required");
    }

    const user = userDB.findByUsername(username);
    if (!user) {
      return badRequestResponse("User not found");
    }

    const authenticators = authenticatorDB.listByUserId(user.id);
    if (authenticators.length === 0) {
      return badRequestResponse("No authenticators found for user");
    }

    const options = await generateAuthenticationOptions({
      rpID: process.env.RP_ID || "localhost",
      userVerification: "preferred",
      allowCredentials: authenticators.map((authenticator) => {
        const parsedTransports = authenticator.transports
          ? (JSON.parse(authenticator.transports) as Parameters<typeof generateAuthenticationOptions>[0]["allowCredentials"] extends Array<infer T>
              ? T extends { transports?: infer U }
                ? U
                : never
              : never)
          : undefined;
        return {
          id: authenticator.credential_id,
          transports: parsedTransports,
        };
      }),
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
