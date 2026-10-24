import { NextResponse } from "next/server";
import { db, getReport, getSettings } from "@/lib/db";
import { toValues } from "@/lib/types";
import { hasErrors, validateMeasurements } from "@/lib/validate";

export const runtime = "nodejs";

/** Re-validate on the server and approve the measurements if there are no errors. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getReport(id);
  if (!data) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  const settings = await getSettings();

  const flags = validateMeasurements({
    values: toValues(data.measurements),
    pitchBreakdown: data.report.pitch_breakdown,
    lowSlopeThreshold: settings.low_slope_threshold ?? 4,
  });

  // Replace previous validation flags with the current result.
  await db().from("report_flags").delete().eq("report_id", id).eq("source", "validation");
  if (flags.length) {
    const ins = await db().from("report_flags").insert(flags.map((f) => ({ report_id: id, source: "validation", ...f })));
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });
  }

  if (hasErrors(flags)) {
    return NextResponse.json({ error: "Fix the errors before approving.", flags }, { status: 422 });
  }

  const now = new Date().toISOString();
  const res = await db().from("reports").update({ status: "approved", approved_at: now, updated_at: now }).eq("id", id);
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  return NextResponse.json({ status: "approved", flags });
}
