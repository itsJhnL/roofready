"""Normalized measurement schema shared by every provider parser.

Every parser returns the same field keys in the same canonical units
(square feet for areas, linear feet for lengths, rise-per-12 for pitch),
so the web app never needs to know which provider a report came from.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Optional

# key -> (label, canonical unit)
FIELDS: dict[str, tuple[str, str]] = {
    "total_area_sqft": ("Total roof area", "sqft"),
    "facet_count": ("Roof facets / planes", "count"),
    "predominant_pitch": ("Predominant pitch", "in/12"),
    "eaves_lf": ("Eaves", "lf"),
    "rakes_lf": ("Rakes", "lf"),
    "ridges_lf": ("Ridges", "lf"),
    "hips_lf": ("Hips", "lf"),
    "valleys_lf": ("Valleys", "lf"),
    "step_flashing_lf": ("Step flashing", "lf"),
    "headwall_flashing_lf": ("Headwall / level-edge flashing", "lf"),
    "drip_edge_lf": ("Drip edge (reported)", "lf"),
    "perimeter_lf": ("Total perimeter (reported)", "lf"),
    "starter_lf": ("Starter (reported)", "lf"),
    "ridge_cap_lf": ("Ridge cap (reported)", "lf"),
    "ice_water_lf": ("Ice & water barrier (reported, linear)", "lf"),
    "ice_water_sqft": ("Ice & water barrier (reported, area)", "sqft"),
    "high_roof_sqft": ("High roof area (over 1 story)", "sqft"),
    "low_slope_area_sqft": ("Low-slope area (below threshold)", "sqft"),
    "suggested_waste_pct": ("Provider suggested waste", "pct"),
}

# Fields every report must supply for the estimate to be usable.
REQUIRED = ["total_area_sqft", "eaves_lf", "rakes_lf", "ridges_lf", "hips_lf", "valleys_lf"]


@dataclass
class Measurement:
    key: str
    value: Optional[float]
    confidence: str  # high | medium | low | derived | missing
    method: str  # text | ocr | derived | none
    source_page: Optional[int] = None
    source_text: Optional[str] = None

    @property
    def label(self) -> str:
        return FIELDS[self.key][0]

    @property
    def unit(self) -> str:
        return FIELDS[self.key][1]

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["label"] = self.label
        d["unit"] = self.unit
        return d


@dataclass
class Flag:
    code: str
    severity: str  # info | warning | error
    message: str
    field: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ExtractionResult:
    provider: str
    provider_label: str
    address: Optional[str] = None
    report_date: Optional[str] = None  # ISO yyyy-mm-dd
    page_methods: list[str] = field(default_factory=list)
    measurements: dict[str, Measurement] = field(default_factory=dict)
    pitch_breakdown: list[dict[str, Any]] = field(default_factory=list)
    planes: list[dict[str, Any]] = field(default_factory=list)
    waste_table: list[dict[str, Any]] = field(default_factory=list)
    flags: list[Flag] = field(default_factory=list)

    def set(self, key: str, value: Optional[float], method: str, page: Optional[int], text: Optional[str]) -> None:
        if key not in FIELDS:
            raise KeyError(key)
        if value is None:
            self.measurements[key] = Measurement(key, None, "missing", "none", page, text)
            return
        confidence = {"text": "high", "ocr": "medium", "derived": "derived"}.get(method, "low")
        self.measurements[key] = Measurement(key, float(value), confidence, method, page, text)

    def flag(self, code: str, severity: str, message: str, field: Optional[str] = None) -> None:
        self.flags.append(Flag(code, severity, message, field))

    def finalize(self) -> None:
        """Fill every schema key so the UI always shows the full list, and flag missing required fields."""
        for key in FIELDS:
            if key not in self.measurements:
                self.measurements[key] = Measurement(key, None, "missing", "none")
        for key in REQUIRED:
            if self.measurements[key].value is None:
                self.flag("missing_required", "error", f"{FIELDS[key][0]} was not found in the report.", key)

    def to_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "provider_label": self.provider_label,
            "address": self.address,
            "report_date": self.report_date,
            "page_methods": self.page_methods,
            "measurements": [m.to_dict() for m in self.measurements.values()],
            "pitch_breakdown": self.pitch_breakdown,
            "planes": self.planes,
            "waste_table": self.waste_table,
            "flags": [f.to_dict() for f in self.flags],
        }
