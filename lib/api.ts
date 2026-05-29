import { NextResponse } from "next/server";

import { getSession, Session } from "@/lib/auth";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}

export async function requireSession(): Promise<Session | null> {
  return await getSession();
}

export function unauthorizedResponse() {
  return NextResponse.json<ApiResponse<never>>(
    {
      success: false,
      error: "Not authenticated",
    },
    { status: 401 },
  );
}

export function badRequestResponse(error: string) {
  return NextResponse.json<ApiResponse<never>>(
    {
      success: false,
      error,
    },
    { status: 400 },
  );
}

export function notFoundResponse(error = "Not found") {
  return NextResponse.json<ApiResponse<never>>(
    {
      success: false,
      error,
    },
    { status: 404 },
  );
}

export function serverErrorResponse(error = "Unexpected server error") {
  return NextResponse.json<ApiResponse<never>>(
    {
      success: false,
      error,
    },
    { status: 500 },
  );
}
