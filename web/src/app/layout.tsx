import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "RoofReady AI — Prototype",
  description: "Roof measurement extraction, review and material calculation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="logo">RoofReady <span>AI</span></div>
          <Link href="/">Reports</Link>
          <Link href="/settings">Calculation settings</Link>
          <div className="spacer" />
          <span className="small" style={{ color: "#8b98a8" }}>Prototype · sample data only</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
