import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME } from "@/lib/cookie";

/**
 * Sends signed-out visitors to the login screen before a page renders.
 *
 * Only the cookie's presence is checked here. The signature is verified in the
 * page itself, which is where the decision actually matters — proxy runs on
 * every request, so it stays cheap and does no crypto.
 *
 * This file also has to exist for a structural reason. Next looks for proxy.ts
 * beside `app/`, and on Vercel that level resolves to the repository root,
 * where the kiosk's own proxy.ts lives — a file whose imports cannot resolve
 * against this app's dependencies. Having our own shadows it.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The sync endpoint carries a bearer token, not a cookie, and login must
  // stay reachable while signed out.
  if (pathname.startsWith("/api/") || pathname === "/login") {
    return NextResponse.next();
  }

  if (req.cookies.get(COOKIE_NAME)?.value) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
