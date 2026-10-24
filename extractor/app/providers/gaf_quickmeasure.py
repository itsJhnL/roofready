"""GAF QuickMeasure (imagery powered by Nearmap).

The report has a real text layer. All totals are taken from the Summary page,
because the Overview page combines ridges and hips into one number and the
Lengths/Pitches/Areas pages are diagrams whose edge types are only shown by colour.
"""

from __future__ import annotations

import re

from ..pdf_io import Page
from ..schema import ExtractionResult
from .util import NUM, find_num, parse_date, to_num

PROVIDER = "gaf_quickmeasure"
LABEL = "GAF QuickMeasure"

# Summary-page label -> schema key. "Flash" is level-edge flashing per the report's note 4.
SUMMARY_FIELDS = [
    (rf"Roof Area\s+{NUM}\s*sq\s*ft", "total_area_sqft"),
    (rf"Roof Facets\s+{NUM}", "facet_count"),
    (rf"^(?:N\s+)?Pitch\s+{NUM}\s*/\s*12", "predominant_pitch"),
    (rf"Eaves\s+{NUM}\s*ft", "eaves_lf"),
    (rf"Hips\s+{NUM}\s*ft", "hips_lf"),
    (rf"Rakes\s+{NUM}\s*ft", "rakes_lf"),
    (rf"Ridges\s+{NUM}\s*ft", "ridges_lf"),
    (rf"Valleys\s+{NUM}\s*ft", "valleys_lf"),
    (rf"^Flash\s+{NUM}\s*ft", "headwall_flashing_lf"),
    (rf"^Step\s+{NUM}\s*ft", "step_flashing_lf"),
    (rf"Drip Edge\s+{NUM}\s*ft", "drip_edge_lf"),
    (rf"Leak Barrier\s+{NUM}\s*ft", "ice_water_lf"),
    (rf"Ridge Cap\s+{NUM}\s*ft", "ridge_cap_lf"),
    (rf"Starter\s+{NUM}\s*ft", "starter_lf"),
]


def matches(text: str) -> bool:
    t = text.lower()
    return "quickmeasure" in t or "powered by nearmap roof & exterior measurements" in t


def _summary_page(pages: list[Page]) -> Page | None:
    for p in pages:
        if "Leak Barrier" in p.text and "Waste" in p.text:
            return p
    return None


def _parse_row(text: str, label: str) -> list[str]:
    m = re.search(rf"^{label}\s+(.+)$", text, re.MULTILINE)
    return m.group(1).split() if m else []


def _suggested_waste(page: Page) -> float | None:
    """The 'Suggested' label sits directly above the highlighted waste column; match by x position."""
    sugg = [w for w in page.words if w["text"] == "Suggested"]
    pct = [w for w in page.words if re.fullmatch(r"\d+%", w["text"])]
    if not sugg or not pct:
        return None
    s = sugg[0]
    s_mid = (s["x0"] + s["x1"]) / 2
    below = [w for w in pct if 0 < w["top"] - s["top"] < 40]
    if not below:
        return None
    best = min(below, key=lambda w: abs((w["x0"] + w["x1"]) / 2 - s_mid))
    return float(best["text"].rstrip("%"))


def parse(pages: list[Page], result: ExtractionResult) -> None:
    first = pages[0]
    lines = [l.strip() for l in first.text.splitlines() if l.strip()]
    for line in lines[:4]:
        if re.search(r",\s*[A-Z]{2}\s+\d{5}", line):
            result.address = re.sub(r"\s*\(\d+\)\s*$", "", line)
        d = parse_date(line, ["%B %d, %Y"])
        if d:
            result.report_date = d

    summary = _summary_page(pages)
    if summary is None:
        result.flag("summary_not_found", "error", "Could not find the Summary page in this GAF QuickMeasure report.")
        return

    for pattern, key in SUMMARY_FIELDS:
        value, line = find_num(pattern, summary.text, re.IGNORECASE | re.MULTILINE)
        result.set(key, value, summary.method, summary.number, line)

    # Pitch breakdown table: "Pitch 3 8" / "Area 292 2,327" / "Percent 11% 89%"
    pitches = _parse_row(summary.text, "Pitch")
    areas = _parse_row(summary.text, "Area")
    percents = _parse_row(summary.text, "Percent")
    if pitches and areas and len(pitches) == len(areas) and "/" not in pitches:
        for i, (p, a) in enumerate(zip(pitches, areas)):
            row = {"pitch": to_num(p), "area_sqft": to_num(a)}
            if i < len(percents):
                row["percent"] = to_num(percents[i].rstrip("%"))
            result.pitch_breakdown.append(row)
    else:
        result.flag("pitch_breakdown_missing", "warning", "Pitch breakdown table could not be read.")

    # Waste table: the second "Area" row and the "Squares" row align with "Waste" columns.
    waste = _parse_row(summary.text, "Waste")
    squares = _parse_row(summary.text, "Squares")
    area_rows = re.findall(r"^Area\s+(.+)$", summary.text, re.MULTILINE)
    waste_areas = area_rows[1].split() if len(area_rows) > 1 else []
    for i, w in enumerate(waste):
        row = {"waste_pct": to_num(w.rstrip("%"))}
        if i < len(waste_areas):
            row["area_sqft"] = to_num(waste_areas[i])
        if i < len(squares):
            row["squares"] = to_num(squares[i])
        result.waste_table.append(row)

    suggested = _suggested_waste(summary)
    result.set("suggested_waste_pct", suggested, summary.method, summary.number,
               f"Suggested waste column: {suggested:g}%" if suggested is not None else None)

    # Fallback: if Summary missed the total area, try the Overview page.
    if result.measurements.get("total_area_sqft") is None or result.measurements["total_area_sqft"].value is None:
        value, line = find_num(rf"Roof Area\s+{NUM}\s*sq\s*ft", first.text)
        result.set("total_area_sqft", value, first.method, first.number, line)

    if "Materials" in first.text and len(pages) < 8:
        result.flag("toc_page_missing", "info",
                    f"Table of contents lists a Materials page 8, but the file has {len(pages)} pages.")
