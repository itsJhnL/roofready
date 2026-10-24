export type MeasurementKey =
  | "total_area_sqft"
  | "facet_count"
  | "predominant_pitch"
  | "eaves_lf"
  | "rakes_lf"
  | "ridges_lf"
  | "hips_lf"
  | "valleys_lf"
  | "step_flashing_lf"
  | "headwall_flashing_lf"
  | "drip_edge_lf"
  | "perimeter_lf"
  | "starter_lf"
  | "ridge_cap_lf"
  | "ice_water_lf"
  | "ice_water_sqft"
  | "high_roof_sqft"
  | "low_slope_area_sqft"
  | "suggested_waste_pct";

/** Measurement values keyed by field; null = missing. */
export type MeasurementValues = Partial<Record<MeasurementKey, number | null>>;

export type Severity = "info" | "warning" | "error";

export interface Flag {
  code: string;
  severity: Severity;
  message: string;
  field?: string | null;
}

export interface PitchRow {
  pitch: number;
  area_sqft: number;
  percent?: number;
}

export interface PlaneRow {
  plane: string;
  area_sqft: number;
  pitch: number;
  high_roof: boolean;
  iwb_sqft: number | null;
}

/** Row in the `measurements` table. */
export interface MeasurementRow {
  id: string;
  report_id: string;
  key: MeasurementKey;
  label: string;
  unit: string;
  extracted_value: number | null;
  value: number | null;
  confidence: "high" | "medium" | "low" | "derived" | "missing";
  method: string;
  source_page: number | null;
  source_text: string | null;
  is_corrected: boolean;
}

export interface ReportRow {
  id: string;
  file_name: string;
  storage_path: string;
  provider: string;
  provider_label: string;
  address: string | null;
  report_date: string | null;
  page_methods: string[];
  status: "needs_review" | "approved";
  pitch_breakdown: PitchRow[];
  planes: PlaneRow[];
  waste_table: { waste_pct: number; area_sqft?: number; squares?: number }[];
  approved_at: string | null;
  created_at: string;
}

export interface FlagRow extends Flag {
  id: string;
  source: "extractor" | "validation";
}

export interface SettingRow {
  key: string;
  value: number;
  unit: string;
  label: string;
  description: string;
  sort_order: number;
}

export type Settings = Record<string, number>;

export function toValues(rows: Pick<MeasurementRow, "key" | "value">[]): MeasurementValues {
  const v: MeasurementValues = {};
  for (const r of rows) v[r.key] = r.value === null ? null : Number(r.value);
  return v;
}
