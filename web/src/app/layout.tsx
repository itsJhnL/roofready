import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "600", "700", "800"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "RoofReady AI — Titan Roofing",
  description: "Roof measurement extraction, review and material calculation",
};

function Mark() {
  // Simple roof-outline mark in the brand blue (not the Titan logo).
  return (
    <svg className="mark" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path d="M3 14 L13 4 L23 14" stroke="#2491eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 13 V22 H20 V13" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body>
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
          <span className="small" style={{ color: "#9fb3c8" }}>Prototype · sample data only</span>
        </header>
        <main>{children}</main>
        <div className="footer">RoofReady AI prototype for Titan Roofing USA · Montana – Texas</div>
      </body>
    </html>
  );
}
