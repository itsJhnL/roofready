import { NextResponse, type NextRequest } from "next/server";
import { authEnabled, SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * Login gate. Active only when DEMO_USER and DEMO_PASSWORD are set (hosted demos);
 * local development without them is open.
 */
export async function middleware(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  const isLoginPage = pathname === "/login";
  const isLoginApi = pathname === "/api/login";
  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (isLoginApi) return NextResponse.next();
  if (isLoginPage) {
    return user ? NextResponse.redirect(new URL("/", req.url)) : NextResponse.next();
  }
  if (user) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
