import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional password gate for hosted demos.
 * Set DEMO_USER and DEMO_PASSWORD in the environment to require a login (HTTP Basic Auth).
 * Leave them unset for local development.
 */
export function middleware(req: NextRequest) {
  const user = process.env.DEMO_USER;
  const pass = process.env.DEMO_PASSWORD;
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const [u, p] = Buffer.from(header.slice(6), "base64").toString().split(":");
    if (u === user && p === pass) return NextResponse.next();
  }
  return new NextResponse("Login required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="RoofReady demo"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
