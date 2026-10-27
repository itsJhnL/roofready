import Link from "next/link";
import { cookies } from "next/headers";
import { authEnabled, SESSION_COOKIE, verifySession } from "@/lib/session";
import SignOut from "./sign-out";

function Mark() {
  // Simple roof-outline mark in the brand blue (not the Titan logo).
  return (
    <svg className="mark" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path d="M3 14 L13 4 L23 14" stroke="#2491eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 13 V22 H20 V13" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Layout for the signed-in app: header, nav, footer. The login page lives outside this group. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = authEnabled() ? await verifySession((await cookies()).get(SESSION_COOKIE)?.value) : null;
  return (
    <>
      <header className="topbar">
        <Link href="/" className="logo" style={{ color: "#fff" }}>
          <Mark />
          <div>
            RoofReady <span>AI</span>
            <small>Titan Roofing USA</small>
          </div>
        </Link>
        <nav>
          <Link href="/">Reports</Link>
          <Link href="/settings">Calculation settings</Link>
        </nav>
        <div className="spacer" />
        {user ? <SignOut user={user} /> : <span className="small" style={{ color: "#9fb3c8" }}>Prototype · sample data only</span>}
      </header>
      <main>{children}</main>
      <div className="footer">RoofReady AI prototype for Titan Roofing USA · Montana – Texas</div>
    </>
  );
}
