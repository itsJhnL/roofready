"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CalculationRow } from "@/lib/db";
import type { Flag, FlagRow, MeasurementKey, MeasurementRow, MeasurementValues, ReportRow } from "@/lib/types";
import { hasErrors, REQUIRED, validateMeasurements } from "@/lib/validate";

const SECTIONS: { title: string; keys: MeasurementKey[] }[] = [
  { title: "Roof", keys: ["total_area_sqft", "facet_count", "predominant_pitch", "low_slope_area_sqft", "high_roof_sqft"] },
  { title: "Edges & lines", keys: ["eaves_lf", "rakes_lf", "ridges_lf", "hips_lf", "valleys_lf"] },
  { title: "Flashing", keys: ["step_flashing_lf", "headwall_flashing_lf"] },
  {
    title: "Provider-reported totals (used for cross-checks)",
    keys: ["drip_edge_lf", "perimeter_lf", "starter_lf", "ridge_cap_lf", "ice_water_lf", "ice_water_sqft", "suggested_waste_pct"],
  },
];

const UNIT_LABEL: Record<string, string> = { sqft: "sf", lf: "lf", count: "", "in/12": "/12", pct: "%" };
const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High · text", medium: "Medium · OCR", derived: "Derived", missing: "Missing", low: "Low",
};

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });

function parse(input: string): number | null {
  const t = input.replace(/,/g, "").trim();
  return t === "" ? null : Number(t);
}

interface Props {
  report: ReportRow;
  measurements: MeasurementRow[];
  extractorFlags: FlagRow[];
  latestCalculation: CalculationRow | null;
  lowSlopeThreshold: number;
}

export default function Review({ report, measurements, extractorFlags, latestCalculation, lowSlopeThreshold }: Props) {
  const router = useRouter();
  const byKey = useMemo(() => new Map(measurements.map((m) => [m.key, m])), [measurements]);
  const [edits, setEdits] = useState<Partial<Record<MeasurementKey, string>>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const saved = (k: MeasurementKey) => (byKey.get(k)?.value ?? null) as number | null;
  const current = (k: MeasurementKey): number | null => (k in edits ? parse(edits[k]!) : saved(k));
  const changedKeys = (Object.keys(edits) as MeasurementKey[]).filter((k) => current(k) !== saved(k));
  const dirty = changedKeys.length > 0;

  const values: MeasurementValues = {};
  for (const m of measurements) values[m.key] = current(m.key);

  // Live validation on the values currently on screen
  const liveFlags = validateMeasurements({ values, pitchBreakdown: report.pitch_breakdown, lowSlopeThreshold });
  // Hide extractor "value not found" errors once the user has entered that value.
  const openExtractorFlags = extractorFlags.filter(
    (f) => !(f.severity === "error" && f.field && current(f.field as MeasurementKey) !== null),
  );
  const allFlags: Flag[] = [...liveFlags, ...openExtractorFlags];
  const order = { error: 0, warning: 1, info: 2 };
  allFlags.sort((a, b) => order[a.severity] - order[b.severity]);
  const blocked = hasErrors(liveFlags);
  const fieldSeverity = (k: string) =>
    allFlags.some((f) => f.field === k && f.severity === "error") ? "error"
      : allFlags.some((f) => f.field === k && f.severity === "warning") ? "warning" : null;

  async function call(label: string, url: string, init: RequestInit, success: string) {
    setBusy(label);
    setMessage(null);
    try {
      const res = await fetch(url, init);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      setMessage({ kind: "ok", text: success });
      return true;
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    for (const k of changedKeys) {
      const v = current(k);
      if (v !== null && (!Number.isFinite(v) || v < 0)) {
        setMessage({ kind: "error", text: `${byKey.get(k)?.label}: enter a number of 0 or more.` });
        return;
      }
    }
    const ok = await call("save", `/api/reports/${report.id}/measurements`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ updates: changedKeys.map((k) => ({ key: k, value: current(k) })), note }),
    }, `Saved ${changedKeys.length} correction(s).`);
    if (ok) { setEdits({}); setNote(""); router.refresh(); }
  }

  async function approve() {
    const ok = await call("approve", `/api/reports/${report.id}/approve`, { method: "POST" }, "Measurements approved.");
    if (ok) router.refresh();
  }

  async function calculate() {
    const ok = await call("calc", `/api/reports/${report.id}/calculate`, { method: "POST" }, "Materials calculated and saved.");
    if (ok) router.refresh();
  }

  const approved = report.status === "approved";
  const ocrCount = measurements.filter((m) => m.confidence === "medium").length;

  return (
    <>
      <div className="grid2">
        <div className="panel">
          <div className="row" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>1. Review measurements</h2>
            <div className="spacer" />
            {ocrCount > 0 && <span className="badge medium">{ocrCount} values read by OCR</span>}
          </div>
          <p className="muted small" style={{ marginTop: 0 }}>
            Check each value against the original PDF and correct anything that is wrong. Changed values are highlighted.
            The extracted value is always kept for audit.
          </p>
          <table>
            <thead>
              <tr>
                <th>Measurement</th>
                <th className="num">Extracted</th>
                <th className="num">Value</th>
                <th>Confidence</th>
                <th>Source in PDF</th>
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((section) => (
                <SectionRows key={section.title} title={section.title}>
                  {section.keys.map((k) => {
                    const m = byKey.get(k);
                    if (!m) return null;
                    const sev = fieldSeverity(k);
                    const isChanged = changedKeys.includes(k);
                    return (
                      <tr key={k} className={sev ? `has-${sev}` : ""}>
                        <td>
                          {m.label}
                          {REQUIRED.includes(k) && <span className="muted"> *</span>}
                          {m.is_corrected && !isChanged && <> <span className="badge corrected">Corrected</span></>}
                        </td>
                        <td className="num muted">{fmt(m.extracted_value)}</td>
                        <td className="num" style={{ whiteSpace: "nowrap" }}>
                          <input
                            type="number"
                            step="any"
                            min={0}
                            aria-label={m.label}
                            className={isChanged ? "changed" : ""}
                            value={k in edits ? edits[k] : m.value ?? ""}
                            onChange={(e) => setEdits({ ...edits, [k]: e.target.value })}
                          />{" "}
                          <span className="small muted unit">{UNIT_LABEL[m.unit] ?? m.unit}</span>
                        </td>
                        <td><span className={`badge ${m.confidence}`}>{CONFIDENCE_LABEL[m.confidence]}</span></td>
                        <td className="source">
                          {m.source_page ? `p.${m.source_page}: ` : ""}
                          {m.source_text ?? (m.confidence === "missing" ? "Not in this report" : "")}
                        </td>
                      </tr>
                    );
                  })}
                </SectionRows>
              ))}
            </tbody>
          </table>

          <div className="row" style={{ marginTop: 16 }}>
            <input type="text" placeholder="Reason for corrections (optional, saved in the audit log)" value={note}
              onChange={(e) => setNote(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
            <button onClick={() => { setEdits({}); setNote(""); }} disabled={!dirty || !!busy}>Discard</button>
            <button onClick={save} disabled={!dirty || !!busy}>{busy === "save" ? "Saving…" : `Save corrections${dirty ? ` (${changedKeys.length})` : ""}`}</button>
            <button className="primary" onClick={approve} disabled={dirty || blocked || approved || !!busy}
              title={dirty ? "Save corrections first" : blocked ? "Fix errors first" : ""}>
              {approved ? "Approved ✓" : busy === "approve" ? "Approving…" : "Approve measurements"}
            </button>
          </div>
          {approved && report.approved_at && (
            <p className="small muted">Approved {new Date(report.approved_at).toLocaleString()}. Editing a value sends the report back to review.</p>
          )}
          {message && <div className={`alert ${message.kind}`}>{message.text}</div>}
        </div>

        <div>
          <div className="panel">
            <h2>Checks &amp; flags</h2>
            <ul className="flags">
              {allFlags.map((f, i) => (
                <li key={i} className={`flag ${f.severity}`}><b>{f.severity}</b>{f.message}</li>
              ))}
            </ul>
          </div>

          {report.pitch_breakdown.length > 0 && (
            <div className="panel">
              <h2>Pitch breakdown</h2>
              <table>
                <thead><tr><th>Pitch</th><th className="num">Area (sf)</th><th className="num">%</th></tr></thead>
                <tbody>
                  {report.pitch_breakdown.map((p) => (
                    <tr key={p.pitch} className={p.pitch < lowSlopeThreshold ? "has-warning" : ""}>
                      <td>{p.pitch}/12{p.pitch < lowSlopeThreshold && " (low slope)"}</td>
                      <td className="num">{fmt(p.area_sqft)}</td>
                      <td className="num">{p.percent ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {report.planes.length > 0 && (
            <div className="panel">
              <details>
                <summary>Roof planes ({report.planes.length})</summary>
                <table style={{ marginTop: 8 }}>
                  <thead><tr><th>Plane</th><th className="num">Area</th><th>Pitch</th><th>High</th><th className="num">IWB</th></tr></thead>
                  <tbody>
                    {report.planes.map((p, i) => (
                      <tr key={i}>
                        <td>{p.plane}</td><td className="num">{fmt(p.area_sqft)}</td><td>{p.pitch}/12</td>
                        <td>{p.high_roof ? "H" : ""}</td><td className="num">{fmt(p.iwb_sqft)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="row">
          <h2 style={{ margin: 0 }}>2. Material quantities</h2>
          <div className="spacer" />
          <a className="btn" href="/settings">Edit formulas &amp; settings</a>
          <button className="primary" onClick={calculate} disabled={!approved || !!busy}
            title={approved ? "" : "Approve the measurements first"}>
            {busy === "calc" ? "Calculating…" : latestCalculation ? "Recalculate" : "Calculate materials"}
          </button>
        </div>
        {!approved && <p className="muted">Approve the measurements to calculate materials. Quantities are only calculated from verified values.</p>}
        {latestCalculation && (
          <Calculation
            calc={latestCalculation}
            stale={!approved || (!!report.approved_at && report.approved_at > latestCalculation.created_at)}
          />
        )}
      </div>
    </>
  );
}

function SectionRows({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <tr className="section"><td colSpan={5}>{title}</td></tr>
      {children}
    </>
  );
}

function Calculation({ calc, stale }: { calc: CalculationRow; stale: boolean }) {
  const r = calc.results;
  return (
    <div style={{ marginTop: 12 }}>
      {stale && <div className="alert error">Measurements changed since this calculation. Approve the measurements and recalculate.</div>}
      <p className="small muted">
        Calculated {new Date(calc.created_at).toLocaleString()} · engine v{calc.engine_version} · waste {r.wastePct}% ({r.wasteSource}).
        Inputs and settings are saved with this calculation.
      </p>
      <table>
        <thead><tr><th>Material</th><th className="num">Quantity</th><th>Unit</th><th>Working</th></tr></thead>
        <tbody>
          {r.items.map((i) => (
            <tr key={i.key}>
              <td>{i.material}</td>
              <td className="num"><strong>{i.quantity.toLocaleString()}</strong></td>
              <td>{i.unit}</td>
              <td className="formula">{i.formula}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {r.warnings.length > 0 && (
        <ul className="flags" style={{ marginTop: 12 }}>
          {r.warnings.map((w, i) => <li key={i} className="flag warning"><b>note</b>{w}</li>)}
        </ul>
      )}
    </div>
  );
}
