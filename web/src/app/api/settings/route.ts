import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Update calculation settings. Existing calculations keep the settings snapshot they were made with. */
export async function PUT(req: Request) {
  const body = (await req.json()) as { values: Record<string, number> };
  const entries = Object.entries(body.values ?? {});
  if (!entries.length) return NextResponse.json({ error: "No settings provided" }, { status: 400 });

  const existing = await db().from("material_settings").select("key, unit");
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
  const units = new Map(existing.data.map((s) => [s.key as string, s.unit as string]));

  for (const [key, value] of entries) {
    if (!units.has(key)) return NextResponse.json({ error: `Unknown setting ${key}` }, { status: 400 });
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: `Invalid value for ${key}` }, { status: 400 });
    }
    if (units.get(key) === "0/1" && value !== 0 && value !== 1) {
      return NextResponse.json({ error: `${key} must be 0 or 1` }, { status: 400 });
    }
    const perUnit = key.endsWith("_per_bundle") || key.endsWith("_per_roll") || key.endsWith("_per_sq") || key.endsWith("_piece_ft");
    if (perUnit && value === 0) return NextResponse.json({ error: `${key} cannot be 0` }, { status: 400 });
  }

  for (const [key, value] of entries) {
    const res = await db().from("material_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  }
  return NextResponse.json({ saved: entries.length });
}
