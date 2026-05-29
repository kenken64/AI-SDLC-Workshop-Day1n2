import { beforeAll, describe, expect, test } from "vitest";

import { signSessionToken, verifySessionToken } from "@/lib/auth";

describe("auth", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "abcdefghijklmnopqrstuvwxyz123456";
  });

  test("signs and verifies session", async () => {
    const token = await signSessionToken({
      userId: "u1",
      username: "tester",
    });

    const session = await verifySessionToken(token);
    expect(session?.userId).toBe("u1");
    expect(session?.username).toBe("tester");
  });
});
