"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SettingRow } from "@/lib/types";

export default function SettingsForm({ settings }: { settings: SettingRow[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(settings.map((s) => [s.key, String(s.value)])),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const changed = settings.filter((s) => Number(values[s.key]) !== Number(s.value));

  async function save() {
    setBusy(true);
    setMessage(null);
    const payload: Record<string, number> = {};
    for (const s of changed) payload[s.key] = Number(values[s.key]);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: payload }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      setMessage({ kind: "ok", text: `Saved ${body.saved} setting(s). Recalculate reports to use them.` });
      router.refresh();
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <table>
        <thead><tr><th>Setting</th><th className="num">Value</th><th>Used for</th></tr></thead>
        <tbody>
          {settings.map((s) => (
            <tr key={s.key}>
              <td><strong>{s.label}</strong><div className="small muted">{s.key}</div></td>
              <td className="num" style={{ whiteSpace: "nowrap" }}>
                <input type="number" step="any" min={0} aria-label={s.label}
                  className={Number(values[s.key]) !== Number(s.value) ? "changed" : ""}
                  value={values[s.key]} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} />{" "}
                <span className="small muted">{s.unit}</span>
              </td>
              <td className="small">{s.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="primary" onClick={save} disabled={!changed.length || busy}>
          {busy ? "Saving…" : `Save settings${changed.length ? ` (${changed.length})` : ""}`}
        </button>
      </div>
      {message && <div className={`alert ${message.kind}`}>{message.text}</div>}
    </>
  );
}
