/**
 * Minimal signed-cookie session for the demo login.
 * Credentials come from DEMO_USER / DEMO_PASSWORD. The cookie holds "user.expiry.signature",
 * signed with HMAC-SHA256 so it cannot be forged. Uses Web Crypto so it runs in middleware (edge) too.
 *
 * This is deliberately simple for a prototype. A production build should use Supabase Auth
 * with real user accounts and roles (estimator / production manager).
 */

export const SESSION_COOKIE = "rr_session";
const SESSION_DAYS = 7;

export function authEnabled(): boolean {
  return Boolean(process.env.DEMO_USER && process.env.DEMO_PASSWORD);
}

function secret(): string {
  return `${process.env.DEMO_USER}:${process.env.DEMO_PASSWORD}:roofready-session`;
}

const enc = new TextEncoder();

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkCredentials(user: string, password: string): boolean {
  if (!authEnabled()) return false;
  return safeEqual(user, process.env.DEMO_USER!) && safeEqual(password, process.env.DEMO_PASSWORD!);
}

export async function createSession(user: string): Promise<{ token: string; maxAge: number }> {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const payload = `${btoa(user)}.${exp}`;
  return { token: `${payload}.${await hmac(payload)}`, maxAge: SESSION_DAYS * 86400 };
}

export async function verifySession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userB64, exp, sig] = parts;
  if (!safeEqual(sig, await hmac(`${userB64}.${exp}`))) return null;
  if (Number(exp) < Date.now()) return null;
  try {
    const user = atob(userB64);
    return user === process.env.DEMO_USER ? user : null;
  } catch {
    return null;
  }
}
