import { describe, expect, it } from "vitest";
import { hasErrors, validateMeasurements } from "./validate";

const gaf = {
  values: {
    total_area_sqft: 2619, predominant_pitch: 8, eaves_lf: 210, rakes_lf: 145, ridges_lf: 83, hips_lf: 32,
    valleys_lf: 41, drip_edge_lf: 355, ridge_cap_lf: 115, starter_lf: 355, low_slope_area_sqft: 292,
    step_flashing_lf: 98, headwall_flashing_lf: 55,
  },
  pitchBreakdown: [{ pitch: 3, area_sqft: 292 }, { pitch: 8, area_sqft: 2327 }],
  lowSlopeThreshold: 4,
};

const byCode = (flags: ReturnType<typeof validateMeasurements>, code: string) => flags.find((f) => f.code === code);

describe("validateMeasurements", () => {
  it("passes the GAF sample with cross-checks and a low-slope warning", () => {
    const flags = validateMeasurements(gaf);
    expect(hasErrors(flags)).toBe(false);
    expect(byCode(flags, "check_drip_edge")?.severity).toBe("info");
    expect(byCode(flags, "check_ridge_cap")?.severity).toBe("info");
    expect(byCode(flags, "check_starter")?.severity).toBe("info");
    expect(byCode(flags, "low_slope")?.severity).toBe("warning");
    expect(byCode(flags, "check_pitch_areas")).toBeUndefined();
  });

  it("flags a misread value through the cross-check", () => {
    const flags = validateMeasurements({ ...gaf, values: { ...gaf.values, eaves_lf: 270 } });
    expect(byCode(flags, "check_drip_edge")?.severity).toBe("warning");
  });

  it("blocks approval when a required value is missing", () => {
    const flags = validateMeasurements({ ...gaf, values: { ...gaf.values, valleys_lf: null } });
    expect(hasErrors(flags)).toBe(true);
    expect(byCode(flags, "required")?.field).toBe("valleys_lf");
  });

  it("blocks approval for negative numbers", () => {
    expect(hasErrors(validateMeasurements({ ...gaf, values: { ...gaf.values, hips_lf: -5 } }))).toBe(true);
  });

  it("warns when the area looks like squares instead of square feet", () => {
    const flags = validateMeasurements({ ...gaf, values: { ...gaf.values, total_area_sqft: 26.19 }, pitchBreakdown: [] });
    expect(byCode(flags, "area_unusual")?.severity).toBe("warning");
  });

  it("warns when pitch breakdown does not add up to the total", () => {
    const flags = validateMeasurements({ ...gaf, values: { ...gaf.values, total_area_sqft: 3000 } });
    expect(byCode(flags, "check_pitch_areas")?.severity).toBe("warning");
  });

  it("warns for pitch below 2/12", () => {
    const flags = validateMeasurements({ ...gaf, values: { ...gaf.values, predominant_pitch: 1 } });
    expect(byCode(flags, "pitch_too_low")?.severity).toBe("warning");
  });
});
