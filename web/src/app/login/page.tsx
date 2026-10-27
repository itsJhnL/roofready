import { Suspense } from "react";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in — RoofReady AI" };

export default function LoginPage() {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <svg viewBox="0 0 26 26" fill="none" aria-hidden="true" width="34" height="34">
            <path d="M3 14 L13 4 L23 14" stroke="#2491eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6 13 V22 H20 V13" stroke="#282828" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <div className="login-title">RoofReady <span>AI</span></div>
            <div className="login-sub">Titan Roofing USA · Prototype</div>
          </div>
        </div>
        <h1>Sign in</h1>
        <p className="muted small">Enter the demo username and password you were given.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
      <div className="footer">Sample data only · no connection to live company systems</div>
    </div>
  );
}
