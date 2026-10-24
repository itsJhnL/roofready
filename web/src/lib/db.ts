// Server-side data access. Never import this file from a "use client" component:
// it uses the Supabase service role key.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FlagRow, MeasurementRow, ReportRow, SettingRow, Settings } from "./types";

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export const BUCKET = "reports";

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: not found`);
  return res.data;
}

export async function listReports(): Promise<ReportRow[]> {
  return must(await db().from("reports").select("*").order("created_at", { ascending: false }), "List reports");
}

export async function getReport(id: string) {
  const [report, measurements, flags, calcs] = await Promise.all([
    db().from("reports").select("*").eq("id", id).maybeSingle(),
    db().from("measurements").select("*").eq("report_id", id),
    db().from("report_flags").select("*").eq("report_id", id).order("created_at"),
    db().from("material_calculations").select("*").eq("report_id", id).order("created_at", { ascending: false }).limit(1),
  ]);
  if (report.error) throw new Error(report.error.message);
  if (!report.data) return null;
  return {
    report: report.data as ReportRow,
    measurements: must(measurements, "Load measurements") as MeasurementRow[],
    flags: must(flags, "Load flags") as FlagRow[],
    latestCalculation: (must(calcs, "Load calculations") as CalculationRow[])[0] ?? null,
  };
}

export interface CalculationRow {
  id: string;
  report_id: string;
  engine_version: string;
  inputs: Record<string, number | null>;
  settings: Settings;
  results: import("./calc").CalculationResult;
  warnings: string[];
  created_at: string;
}

export async function listSettings(): Promise<SettingRow[]> {
  return must(await db().from("material_settings").select("*").order("sort_order"), "Load settings");
}

export async function getSettings(): Promise<Settings> {
  const rows = await listSettings();
  return Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
}
