import { describe, expect, test } from "vitest";

import { addMinutes, formatSingaporeDate, isAtLeastOneMinuteInFuture } from "@/lib/timezone";

describe("timezone utils", () => {
  test("future date validator", () => {
    const future = addMinutes(new Date(), 2);
    expect(isAtLeastOneMinuteInFuture(future)).toBe(true);
  });

  test("format returns text", () => {
    expect(formatSingaporeDate("2026-01-01T00:00:00.000Z").length).toBeGreaterThan(0);
  });
});
