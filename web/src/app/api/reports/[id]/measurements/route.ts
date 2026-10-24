import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

interface Body {
  updates: { key: string; value: number | null }[];
  note?: string;
}

/**
 * Save manual corrections. Each change is written to measurement_corrections (audit trail).
 * Editing an approved report sends it back to review.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as Body;
  if (!Array.isArray(body.updates) || body.updates.length === 0) {
    return NextResponse.json({ error: "No changes to save" }, { status: 400 });
  }
  for (const u of body.updates) {
    if (u.value !== null && (typeof u.value !== "number" || !Number.isFinite(u.value) || u.value < 0)) {
      return NextResponse.json({ error: `Invalid value for ${u.key}` }, { status: 400 });
    }
  }

  const current = await db().from("measurements").select("id, key, value").eq("report_id", id);
  if (current.error) return NextResponse.json({ error: current.error.message }, { status: 500 });
  const byKey = new Map(current.data.map((m) => [m.key as string, m]));

  const corrections = [];
  for (const u of body.updates) {
    const row = byKey.get(u.key);
    if (!row) return NextResponse.json({ error: `Unknown measurement ${u.key}` }, { status: 400 });
    const old = row.value === null ? null : Number(row.value);
    if (old === u.value) continue;
    const res = await db().from("measurements").update({ value: u.value, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
    corrections.push({ measurement_id: row.id, report_id: id, key: u.key, old_value: old, new_value: u.value, note: body.note || null });
  }

  if (corrections.length) {
    const log = await db().from("measurement_corrections").insert(corrections);
    if (log.error) return NextResponse.json({ error: log.error.message }, { status: 500 });
    await db().from("reports").update({ status: "needs_review", approved_at: null, updated_at: new Date().toISOString() }).eq("id", id);
  }
  return NextResponse.json({ saved: corrections.length });
}
