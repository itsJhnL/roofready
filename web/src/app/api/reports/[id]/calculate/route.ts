import { NextResponse } from "next/server";
import { calculateMaterials } from "@/lib/calc";
import { db, getReport, getSettings } from "@/lib/db";
import { toValues } from "@/lib/types";

export const runtime = "nodejs";

/** Calculate material quantities from APPROVED measurements and store a snapshot. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getReport(id);
  if (!data) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  if (data.report.status !== "approved") {
    return NextResponse.json({ error: "Approve the measurements before calculating materials." }, { status: 409 });
  }

  const inputs = toValues(data.measurements);
  const settings = await getSettings();
  let results;
  try {
    results = calculateMaterials(inputs, settings);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const ins = await db()
    .from("material_calculations")
    .insert({ report_id: id, engine_version: results.engineVersion, inputs, settings, results, warnings: results.warnings })
    .select()
    .single();
  if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });
  return NextResponse.json(ins.data);
}
