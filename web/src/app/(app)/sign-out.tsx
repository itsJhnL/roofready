"use client";

export default function SignOut({ user }: { user: string }) {
  async function signOut() {
    await fetch("/api/login", { method: "DELETE" });
    window.location.assign("/login");
  }
  return (
    <span className="small" style={{ color: "#9fb3c8" }}>
      {user} · <a href="#" onClick={(e) => { e.preventDefault(); signOut(); }}>Sign out</a>
    </span>
  );
}
