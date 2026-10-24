/**
 * Deterministic material calculation engine.
 *
 * Pure functions only: same inputs + same settings always give the same result.
 * No AI is involved. Every line item carries a human-readable formula showing
 * the numbers used, so an estimator can check the working by hand.
 *
 * Rounding rule: intermediate values are kept exact; only the final purchase
 * quantity is rounded UP to a whole unit.
 */
import type { MeasurementValues, Settings } from "./types";

export const ENGINE_VERSION = "0.1.0";

export interface LineItem {
  key: string;
  material: string;
  quantity: number; // purchase quantity, whole units
  unit: string; // purchase unit
  base: number; // measured quantity before conversion to purchase units
  baseUnit: string;
  formula: string;
}

export interface CalculationResult {
  engineVersion: string;
  wastePct: number;
  wasteSource: string;
  items: LineItem[];
  warnings: string[];
}

/** Round up, ignoring floating-point noise (e.g. 3.0000000001 -> 3, not 4). */
export function ceilUnits(x: number): number {
  return Math.ceil(Math.round(x * 1e6) / 1e6);
}

const fmt = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { maximumFractionDigits: digits });

function setting(settings: Settings, key: string): number {
  const v = settings[key];
  if (v === undefined || !Number.isFinite(v)) throw new Error(`Missing calculation setting: ${key}`);
  return v;
}

export function calculateMaterials(m: MeasurementValues, settings: Settings): CalculationResult {
  const items: LineItem[] = [];
  const warnings: string[] = [];
  const has = (k: keyof MeasurementValues) => m[k] !== null && m[k] !== undefined;
  const val = (k: keyof MeasurementValues) => Number(m[k] ?? 0);
  const need = (material: string, ...keys: (keyof MeasurementValues)[]) => {
    const missing = keys.filter((k) => !has(k));
    if (missing.length) warnings.push(`${material} not calculated: missing ${missing.join(", ")}.`);
    return missing.length === 0;
  };

  // Waste factor
  const useProvider = setting(settings, "use_provider_waste") === 1 && has("suggested_waste_pct");
  const wastePct = useProvider ? val("suggested_waste_pct") : setting(settings, "default_waste_pct");
  const wasteSource = useProvider ? "provider suggested" : "default setting";

  // 1. Shingles
  if (need("Shingles", "total_area_sqft")) {
    const area = val("total_area_sqft");
    const withWaste = area * (1 + wastePct / 100);
    const squares = withWaste / 100;
    const bpsq = setting(settings, "shingle_bundles_per_sq");
    items.push({
      key: "shingles",
      material: "Shingles",
      quantity: ceilUnits(squares * bpsq),
      unit: "bundles",
      base: withWaste,
      baseUnit: "sf",
      formula: `${fmt(area)} sf × (1 + ${fmt(wastePct)}% waste) = ${fmt(withWaste)} sf = ${fmt(squares, 4)} sq × ${fmt(bpsq)} bundles/sq = ${fmt(squares * bpsq, 4)} → round up`,
    });
  }

  // 2. Starter strip: eaves + rakes
  if (need("Starter", "eaves_lf", "rakes_lf")) {
    const lf = val("eaves_lf") + val("rakes_lf");
    const per = setting(settings, "starter_lf_per_bundle");
    items.push({
      key: "starter",
      material: "Starter strip",
      quantity: ceilUnits(lf / per),
      unit: "bundles",
      base: lf,
      baseUnit: "lf",
      formula: `(${fmt(val("eaves_lf"))} eaves + ${fmt(val("rakes_lf"))} rakes) = ${fmt(lf)} lf ÷ ${fmt(per)} lf/bundle = ${fmt(lf / per, 4)} → round up`,
    });
  }

  // 3. Hip & ridge cap: ridges + hips
  if (need("Ridge cap", "ridges_lf", "hips_lf")) {
    const lf = val("ridges_lf") + val("hips_lf");
    const per = setting(settings, "ridge_cap_lf_per_bundle");
    items.push({
      key: "ridge_cap",
      material: "Hip & ridge cap",
      quantity: ceilUnits(lf / per),
      unit: "bundles",
      base: lf,
      baseUnit: "lf",
      formula: `(${fmt(val("ridges_lf"))} ridges + ${fmt(val("hips_lf"))} hips) = ${fmt(lf)} lf ÷ ${fmt(per)} lf/bundle = ${fmt(lf / per, 4)} → round up`,
    });
  }

  // 4. Ice & water barrier: reported area > reported LF × roll width > formula; plus low-slope area.
  {
    let sqft: number | null = null;
    let working = "";
    if (has("ice_water_sqft")) {
      sqft = val("ice_water_sqft");
      working = `${fmt(sqft)} sf (reported)`;
    } else if (has("ice_water_lf")) {
      const width = setting(settings, "iwb_roll_width_ft");
      sqft = val("ice_water_lf") * width;
      working = `${fmt(val("ice_water_lf"))} lf (reported) × ${fmt(width)} ft roll width = ${fmt(sqft)} sf`;
    } else if (has("eaves_lf") && has("valleys_lf")) {
      const ew = setting(settings, "iwb_eave_width_ft");
      const vw = setting(settings, "iwb_valley_width_ft");
      sqft = val("eaves_lf") * ew + val("valleys_lf") * vw;
      working = `(${fmt(val("eaves_lf"))} eaves × ${fmt(ew)} ft) + (${fmt(val("valleys_lf"))} valleys × ${fmt(vw)} ft) = ${fmt(sqft)} sf`;
    } else {
      warnings.push("Ice & water barrier not calculated: no reported value and eaves/valleys missing.");
    }
    if (sqft !== null) {
      const low = val("low_slope_area_sqft");
      if (setting(settings, "low_slope_full_iwb") === 1 && low > 0) {
        sqft += low;
        working += ` + ${fmt(low)} sf low-slope area = ${fmt(sqft)} sf`;
      }
      const per = setting(settings, "iwb_sqft_per_roll");
      items.push({
        key: "ice_water",
        material: "Ice & water barrier",
        quantity: ceilUnits(sqft / per),
        unit: "rolls",
        base: sqft,
        baseUnit: "sf",
        formula: `${working} ÷ ${fmt(per)} sf/roll = ${fmt(sqft / per, 4)} → round up`,
      });
    }
  }

  // 5. Synthetic underlayment over the full deck (ice & water areas not subtracted: conservative).
  if (need("Underlayment", "total_area_sqft")) {
    const area = val("total_area_sqft");
    const w = setting(settings, "underlayment_waste_pct");
    const per = setting(settings, "underlayment_sqft_per_roll");
    const sqft = area * (1 + w / 100);
    items.push({
      key: "underlayment",
      material: "Synthetic underlayment",
      quantity: ceilUnits(sqft / per),
      unit: "rolls",
      base: sqft,
      baseUnit: "sf",
      formula: `${fmt(area)} sf × (1 + ${fmt(w)}%) = ${fmt(sqft)} sf ÷ ${fmt(per)} sf/roll = ${fmt(sqft / per, 4)} → round up`,
    });
  }

  // 6. Drip edge: eaves + rakes
  if (need("Drip edge", "eaves_lf", "rakes_lf")) {
    const lf = val("eaves_lf") + val("rakes_lf");
    const w = setting(settings, "drip_edge_waste_pct");
    const piece = setting(settings, "drip_edge_piece_ft");
    const total = lf * (1 + w / 100);
    items.push({
      key: "drip_edge",
      material: "Drip edge",
      quantity: ceilUnits(total / piece),
      unit: "pieces",
      base: total,
      baseUnit: "lf",
      formula: `(${fmt(val("eaves_lf"))} + ${fmt(val("rakes_lf"))}) = ${fmt(lf)} lf × (1 + ${fmt(w)}%) = ${fmt(total)} lf ÷ ${fmt(piece)} ft/piece = ${fmt(total / piece, 4)} → round up`,
    });
  }

  // 7–8. Flashing: passed through in linear feet (piece conversion not configured yet).
  for (const [key, material, field] of [
    ["step_flashing", "Step flashing", "step_flashing_lf"],
    ["headwall_flashing", "Headwall / apron flashing", "headwall_flashing_lf"],
  ] as const) {
    if (has(field)) {
      items.push({
        key,
        material,
        quantity: ceilUnits(val(field)),
        unit: "lf",
        base: val(field),
        baseUnit: "lf",
        formula: `${fmt(val(field))} lf from report → round up to whole lf`,
      });
    } else {
      warnings.push(`${material} not in report. Measure on site if the roof has wall intersections.`);
    }
  }

  return { engineVersion: ENGINE_VERSION, wastePct, wasteSource, items, warnings };
}
