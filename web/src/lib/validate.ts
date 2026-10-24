/**
 * Measurement validation. Runs live in the review screen and again on the server
 * before approval. Errors block approval; warnings and info are shown for review.
 */
import type { Flag, MeasurementKey, MeasurementValues, PitchRow } from "./types";

export const REQUIRED: MeasurementKey[] = [
  "total_area_sqft",
  "eaves_lf",
  "rakes_lf",
  "ridges_lf",
  "hips_lf",
  "valleys_lf",
];

const LABELS: Partial<Record<MeasurementKey, string>> = {
  total_area_sqft: "Total roof area",
  eaves_lf: "Eaves",
  rakes_lf: "Rakes",
  ridges_lf: "Ridges",
  hips_lf: "Hips",
  valleys_lf: "Valleys",
  predominant_pitch: "Predominant pitch",
};

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

export interface ValidationInput {
  values: MeasurementValues;
  pitchBreakdown: PitchRow[];
  lowSlopeThreshold: number;
}

export function validateMeasurements({ values: v, pitchBreakdown, lowSlopeThreshold }: ValidationInput): Flag[] {
  const flags: Flag[] = [];
  const has = (k: MeasurementKey) => v[k] !== null && v[k] !== undefined;
  const n = (k: MeasurementKey) => Number(v[k]);

  for (const k of REQUIRED) {
    if (!has(k)) flags.push({ code: "required", severity: "error", field: k, message: `${LABELS[k]} is required. Enter 0 if the roof has none.` });
  }
  for (const [k, value] of Object.entries(v) as [MeasurementKey, number | null][]) {
    if (value === null || value === undefined) continue;
    if (!Number.isFinite(value) || value < 0) {
      flags.push({ code: "invalid_number", severity: "error", field: k, message: `${k} must be a number of 0 or more.` });
    }
  }

  if (has("total_area_sqft")) {
    const a = n("total_area_sqft");
    if (a <= 0) flags.push({ code: "area_zero", severity: "error", field: "total_area_sqft", message: "Total roof area must be greater than 0." });
    else if (a < 200 || a > 500_000)
      flags.push({ code: "area_unusual", severity: "warning", field: "total_area_sqft", message: `Total roof area of ${fmt(a)} sf is unusual. Check the units (sf vs squares).` });
  }

  if (!has("predominant_pitch")) {
    flags.push({ code: "pitch_missing", severity: "warning", field: "predominant_pitch", message: "Pitch is missing. Labor and low-slope checks need it." });
  } else {
    const p = n("predominant_pitch");
    if (p > 24) flags.push({ code: "pitch_range", severity: "error", field: "predominant_pitch", message: `Pitch ${p}/12 is outside the 0–24/12 range.` });
    else if (p < 2) flags.push({ code: "pitch_too_low", severity: "warning", field: "predominant_pitch", message: `Pitch ${p}/12 is below 2/12. Asphalt shingles are not suitable; a low-slope system is needed.` });
  }

  // Cross-checks against the provider's own totals
  const tolerance = (x: number) => Math.max(2, x * 0.01);
  const check = (code: string, field: MeasurementKey, label: string, expected: number, expectedLabel: string) => {
    if (!has(field)) return;
    const reported = n(field);
    if (Math.abs(reported - expected) > tolerance(expected)) {
      flags.push({ code, severity: "warning", field, message: `${label} (${fmt(reported)} lf) does not match ${expectedLabel} (${fmt(expected)} lf). One of the values may be misread.` });
    } else {
      flags.push({ code, severity: "info", field, message: `Cross-check passed: ${label} matches ${expectedLabel}.` });
    }
  };
  if (has("eaves_lf") && has("rakes_lf")) {
    const er = n("eaves_lf") + n("rakes_lf");
    check("check_drip_edge", "drip_edge_lf", "Reported drip edge", er, "eaves + rakes");
    check("check_perimeter", "perimeter_lf", "Reported perimeter", er, "eaves + rakes");
    check("check_starter", "starter_lf", "Reported starter", er, "eaves + rakes");
  }
  if (has("ridges_lf") && has("hips_lf")) {
    check("check_ridge_cap", "ridge_cap_lf", "Reported ridge cap", n("ridges_lf") + n("hips_lf"), "ridges + hips");
  }

  if (pitchBreakdown.length && has("total_area_sqft")) {
    const sum = pitchBreakdown.reduce((s, r) => s + r.area_sqft, 0);
    const total = n("total_area_sqft");
    if (Math.abs(sum - total) > Math.max(5, total * 0.01)) {
      flags.push({ code: "check_pitch_areas", severity: "warning", field: "total_area_sqft", message: `Pitch breakdown areas sum to ${fmt(sum)} sf but total roof area is ${fmt(total)} sf.` });
    }
    const minPitch = Math.min(...pitchBreakdown.map((r) => r.pitch));
    if (minPitch < lowSlopeThreshold && (!has("low_slope_area_sqft") || n("low_slope_area_sqft") === 0)) {
      flags.push({ code: "low_slope_unset", severity: "warning", field: "low_slope_area_sqft", message: `The report has areas at ${minPitch}/12 but low-slope area is 0.` });
    }
  }
  if (has("low_slope_area_sqft") && n("low_slope_area_sqft") > 0) {
    flags.push({ code: "low_slope", severity: "warning", field: "low_slope_area_sqft", message: `${fmt(n("low_slope_area_sqft"))} sf is below ${lowSlopeThreshold}/12. Ice & water is added over this area (see Settings).` });
  }
  if (!has("step_flashing_lf") && !has("headwall_flashing_lf")) {
    flags.push({ code: "flashing_missing", severity: "info", message: "No flashing lengths in the report. Confirm on site." });
  }

  return flags;
}

export function hasErrors(flags: Flag[]): boolean {
  return flags.some((f) => f.severity === "error");
}
