import { NextResponse, type NextRequest } from "next/server";

import { verifySessionToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get("todo_session")?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session && (request.nextUrl.pathname === "/" || request.nextUrl.pathname.startsWith("/calendar"))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (session && request.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/calendar/:path*", "/login"],
};
