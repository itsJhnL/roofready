import { describe, expect, it } from "vitest";
import { calculateMaterials, ceilUnits } from "./calc";
import type { MeasurementValues, Settings } from "./types";

// Same values as the seed data in supabase/migrations/0001_init.sql
export const DEFAULT_SETTINGS: Settings = {
  default_waste_pct: 10,
  use_provider_waste: 1,
  shingle_bundles_per_sq: 3,
  starter_lf_per_bundle: 120,
  ridge_cap_lf_per_bundle: 25,
  iwb_sqft_per_roll: 200,
  iwb_roll_width_ft: 3,
  iwb_eave_width_ft: 6,
  iwb_valley_width_ft: 3,
  low_slope_threshold: 4,
  low_slope_full_iwb: 1,
  underlayment_sqft_per_roll: 1000,
  underlayment_waste_pct: 10,
  drip_edge_piece_ft: 10,
  drip_edge_waste_pct: 10,
};

// Values extracted from the GAF QuickMeasure sample (83 Wedgewood Ln)
const GAF: MeasurementValues = {
  total_area_sqft: 2619, predominant_pitch: 8, eaves_lf: 210, rakes_lf: 145, ridges_lf: 83, hips_lf: 32,
  valleys_lf: 41, step_flashing_lf: 98, headwall_flashing_lf: 55, drip_edge_lf: 355, ice_water_lf: 580,
  ridge_cap_lf: 115, starter_lf: 355, suggested_waste_pct: 13, low_slope_area_sqft: 292,
};

// Values extracted from the RoofScope sample (121 2nd Ave W)
const ROOFSCOPE: MeasurementValues = {
  total_area_sqft: 20031, predominant_pitch: 4, eaves_lf: 787.5, rakes_lf: 349.7, perimeter_lf: 1137.2,
  ridges_lf: 355.5, hips_lf: 162, valleys_lf: 174.4, step_flashing_lf: 223.2, headwall_flashing_lf: 93.5,
  ice_water_sqft: 4725, high_roof_sqft: 18273, low_slope_area_sqft: 0, suggested_waste_pct: null,
};

const qty = (m: MeasurementValues, s = DEFAULT_SETTINGS) =>
  Object.fromEntries(calculateMaterials(m, s).items.map((i) => [i.key, i.quantity]));

describe("ceilUnits", () => {
  it("rounds up real fractions", () => expect(ceilUnits(2.01)).toBe(3));
  it("ignores floating-point noise", () => expect(ceilUnits(0.1 * 3 * 10)).toBe(3));
  it("keeps whole numbers", () => expect(ceilUnits(40)).toBe(40));
});

describe("GAF QuickMeasure sample", () => {
  it("uses the provider's suggested 13% waste", () => {
    const r = calculateMaterials(GAF, DEFAULT_SETTINGS);
    expect(r.wastePct).toBe(13);
    expect(r.wasteSource).toBe("provider suggested");
  });
  it("calculates expected quantities", () => {
    expect(qty(GAF)).toEqual({
      shingles: 89, // 2619 × 1.13 = 2959.47 sf → 29.59 sq × 3 = 88.78
      starter: 3, // 355 / 120 = 2.96
      ridge_cap: 5, // 115 / 25 = 4.6
      ice_water: 11, // 580 × 3 = 1740 + 292 low slope = 2032 / 200 = 10.16
      underlayment: 3, // 2619 × 1.1 = 2880.9 / 1000
      drip_edge: 40, // 355 × 1.1 = 390.5 / 10
      step_flashing: 98,
      headwall_flashing: 55,
    });
  });
  it("skips low-slope ice & water when the setting is off", () => {
    expect(qty(GAF, { ...DEFAULT_SETTINGS, low_slope_full_iwb: 0 }).ice_water).toBe(9); // 1740 / 200 = 8.7
  });
  it("uses the default waste when provider waste is turned off", () => {
    expect(qty(GAF, { ...DEFAULT_SETTINGS, use_provider_waste: 0 }).shingles).toBe(87); // 2619 × 1.1 × 3 / 100 = 86.43
  });
});

describe("RoofScope sample", () => {
  it("falls back to the default 10% waste", () => {
    expect(calculateMaterials(ROOFSCOPE, DEFAULT_SETTINGS).wasteSource).toBe("default setting");
  });
  it("calculates expected quantities", () => {
    expect(qty(ROOFSCOPE)).toEqual({
      shingles: 662, // 20031 × 1.1 = 22034.1 → 220.34 sq × 3 = 661.02
      starter: 10, // 1137.2 / 120 = 9.48
      ridge_cap: 21, // 517.5 / 25 = 20.7
      ice_water: 24, // 4725 / 200 = 23.63
      underlayment: 23, // 22034.1 / 1000
      drip_edge: 126, // 1137.2 × 1.1 = 1250.92 / 10
      step_flashing: 224,
      headwall_flashing: 94,
    });
  });
});

describe("missing data", () => {
  it("uses the eave/valley formula when no ice & water is reported", () => {
    const m = { ...GAF, ice_water_lf: null, low_slope_area_sqft: 0 };
    const item = calculateMaterials(m, DEFAULT_SETTINGS).items.find((i) => i.key === "ice_water")!;
    expect(item.base).toBe(210 * 6 + 41 * 3); // 1383
    expect(item.quantity).toBe(7);
  });
  it("warns instead of guessing when inputs are missing", () => {
    const r = calculateMaterials({ total_area_sqft: 1000 }, DEFAULT_SETTINGS);
    expect(r.items.map((i) => i.key)).toEqual(["shingles", "underlayment"]);
    expect(r.warnings.some((w) => w.startsWith("Starter not calculated"))).toBe(true);
  });
  it("throws if a setting is missing", () => {
    const { shingle_bundles_per_sq: _, ...partial } = DEFAULT_SETTINGS;
    expect(() => calculateMaterials(GAF, partial)).toThrow(/shingle_bundles_per_sq/);
  });
});
