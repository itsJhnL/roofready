import { NextResponse } from "next/server";
import { authEnabled, checkCredentials, createSession, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 8;
const LOCK_MS = 10 * 60_000;

/** Sign in: sets the session cookie. */
export async function POST(req: Request) {
  if (!authEnabled()) return NextResponse.json({ error: "Login is not enabled" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const a = attempts.get(ip);
  if (a && a.count >= MAX_ATTEMPTS && Date.now() < a.until) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { user?: string; password?: string };
  const user = String(body.user ?? "").trim();
  const password = String(body.password ?? "");

  if (!checkCredentials(user, password)) {
    const next = a && Date.now() < a.until ? a.count + 1 : 1;
    attempts.set(ip, { count: next, until: Date.now() + LOCK_MS });
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }
  attempts.delete(ip);

  const { token, maxAge } = await createSession(user);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  return res;
}

/** Sign out: clears the session cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
