"""RoofScope (Scope Technologies).

The sample report is image-only (two scanned JPEG pages, no text layer), so every
value comes from OCR and is marked medium confidence.

Page 1 "Project Totals" OCRs cleanly and supplies all totals.
Page 2 has a per-plane table (area, pitch, high-roof marker, IWB) and a pitch
totals box. Single digits in that table are sometimes misread, so the table is
treated as supporting evidence: its column sums are compared to page 1 and any
mismatch is flagged for review instead of being trusted.
"""

from __future__ import annotations

import re

import pytesseract
from PIL import Image, ImageOps

from ..pdf_io import Page, ocr_image
from ..schema import ExtractionResult
from .util import NUM, find_num, parse_date, to_num

PROVIDER = "roofscope"
LABEL = "RoofScope"

SEP = r"[^\d\n]{0,8}?"  # OCR renders the "-" separator as -, =, s, ~, — etc.
SQFT_PER_SQ = 100.0

# (pattern, key, multiplier) — RoofScope reports area in squares (SQ).
PAGE1_FIELDS = [
    (rf"Total Roof Area{SEP}{NUM}\s*SQ", "total_area_sqft", SQFT_PER_SQ),
    (rf"High Roof.*?\){SEP}{NUM}\s*SQ", "high_roof_sqft", SQFT_PER_SQ),
    (rf"IWB.*?\){SEP}{NUM}\s*SF", "ice_water_sqft", 1.0),
    (rf"Roof Planes{SEP}{NUM}", "facet_count", 1.0),
    (rf"Eave{SEP}{NUM}\s*LF", "eaves_lf", 1.0),
    (rf"Rake Edge{SEP}{NUM}\s*LF", "rakes_lf", 1.0),
    (rf"Total Perimeter{SEP}{NUM}\s*LF", "perimeter_lf", 1.0),
    (rf"^Ridge{SEP}{NUM}\s*LF", "ridges_lf", 1.0),
    (rf"^Hip{SEP}{NUM}\s*LF", "hips_lf", 1.0),
    (rf"^Valley{SEP}{NUM}\s*LF", "valleys_lf", 1.0),
    (rf"Step Flashing{SEP}{NUM}\s*LF", "step_flashing_lf", 1.0),
    (rf"Headwall Flashing{SEP}{NUM}\s*LF", "headwall_flashing_lf", 1.0),
]

# Plane label is often misread (I -> "|", O -> "ie)"), so accept any short token; the numbers are what matter.
PLANE_ROW = re.compile(
    r"^\s*(\S{1,3})\s+(\d[\d,]*)\s+(\d{1,2})\s*:\s*12\s*(H)?\s*(\d[\d,]*)?\s*$"
)

# OCR passes tried in order; the first whose plane areas reconcile with the page 1 total wins.
OCR_VARIANTS = [
    ("2x-binarized", 2, 170),
    ("2x-grayscale", 2, None),
    ("1x-binarized", 1, 170),
    ("1x-grayscale", 1, None),
]


def matches(text: str) -> bool:
    t = text.lower()
    return "roofscope" in t or "scope technologies" in t


def _fixed_crop(image: Image.Image) -> Image.Image:
    """RoofScope's standard layout puts the plane table in the upper-right quarter of page 2."""
    w, h = image.size
    return image.crop((int(w * 0.75), int(h * 0.08), w, int(h * 0.72)))


def _detected_crop(image: Image.Image) -> Image.Image | None:
    """Slower fallback: find the 'Plane | Area(sf) | Pitch...' header with OCR and crop below it."""
    w, h = image.size
    data = pytesseract.image_to_data(image, config="--psm 11", output_type=pytesseract.Output.DICT)
    for i, word in enumerate(data["text"]):
        if word.strip().startswith("Plane") and data["left"][i] > w * 0.5:
            x, y = data["left"][i], data["top"][i]
            return image.crop((max(0, x - 20), max(0, y - 10), w, int(h * 0.75)))
    return None


def _prepare(crop: Image.Image, scale: int, threshold: int | None) -> Image.Image:
    img = crop.resize((crop.width * scale, crop.height * scale)) if scale > 1 else crop
    img = ImageOps.grayscale(img)
    if threshold is not None:
        img = img.point(lambda x: 255 if x > threshold else 0)
    return img


def _plane_label(index: int) -> str:
    """0 -> A, 25 -> Z, 26 -> AA, 27 -> AB ..."""
    label = ""
    index += 1
    while index > 0:
        index, rem = divmod(index - 1, 26)
        label = chr(65 + rem) + label
    return label


def _read_plane_rows(table_text: str) -> tuple[list[dict], int]:
    rows, unreadable, in_table = [], 0, False
    for raw in table_text.splitlines():
        line = raw.strip()
        if not line:
            continue
        low = line.lower()
        if low.startswith("plane"):
            in_table = True
            continue
        if low.startswith(("slope", "totals")):
            in_table = False
        if not in_table:
            continue
        m = PLANE_ROW.match(line)
        if not m:
            unreadable += 1
            continue
        label = m.group(1).upper()
        if not label.isalpha():  # OCR reads "I" as "|" or "l"; planes are lettered A, B, ... Z, AA, AB, ...
            label = _plane_label(len(rows))
        rows.append({
            "plane": label,
            "area_sqft": to_num(m.group(2)),
            "pitch": float(m.group(3)),
            "high_roof": bool(m.group(4)),
            "iwb_sqft": to_num(m.group(5)) if m.group(5) else None,
        })
    return rows, unreadable


def _parse_plane_page(page: Page, result: ExtractionResult) -> None:
    if page.image is None:
        return
    total = result.measurements.get("total_area_sqft")
    total_sqft = total.value if total else None

    def reconciles(rows, unreadable):
        return (total_sqft is not None and rows and unreadable == 0
                and abs(sum(r["area_sqft"] for r in rows) - total_sqft) <= max(5.0, total_sqft * 0.005))

    # Fast path: fixed crop + best OCR variant. Fallbacks only run if the numbers don't add up.
    best = None  # (variant, text, rows, unreadable)
    crops = [("fixed", _fixed_crop(page.image))]
    done = False
    for crop_name, crop in crops:
        for name, scale, threshold in OCR_VARIANTS:
            text = ocr_image(_prepare(crop, scale, threshold), psm=6)
            rows, unreadable = _read_plane_rows(text)
            label = f"{crop_name}/{name}"
            if best is None or len(rows) > len(best[2]):
                best = (label, text, rows, unreadable)
            if reconciles(rows, unreadable):
                best = (label, text, rows, unreadable)
                done = True
                break
        if done:
            break
        if crop_name == "fixed":
            detected = _detected_crop(page.image)
            if detected is not None:
                crops.append(("detected", detected))
    variant, table_text, rows, unreadable = best
    result.planes = rows

    # Pitch totals box ("4:12 - 200.31") is large print and reads reliably.
    pitch_totals = re.findall(rf"(\d{{1,2}})\s*:\s*12{SEP}{NUM}\s*$", table_text.split("Totals")[-1], re.MULTILINE)
    for pitch, sq in pitch_totals:
        area = to_num(sq) * SQFT_PER_SQ
        row = {"pitch": float(pitch), "area_sqft": round(area, 2)}
        if total_sqft:
            row["percent"] = round(area / total_sqft * 100, 1)
        result.pitch_breakdown.append(row)

    if result.pitch_breakdown:
        main = max(result.pitch_breakdown, key=lambda r: r["area_sqft"])
        result.set("predominant_pitch", main["pitch"], "ocr", page.number,
                   f"Pitch totals: " + ", ".join(f"{p}:12 - {s} SQ" for p, s in pitch_totals))
    else:
        result.flag("pitch_not_found", "error", "Pitch could not be read from the plane table page.", "predominant_pitch")

    # Cross-check the plane table against page 1 totals.
    if unreadable:
        result.flag("plane_rows_unreadable", "warning",
                    f"{unreadable} row(s) of the per-plane table could not be read by OCR.")
    if total_sqft and rows:
        s = sum(r["area_sqft"] for r in rows)
        if abs(s - total_sqft) > max(5.0, total_sqft * 0.005):
            result.flag("plane_area_mismatch", "warning",
                        f"Per-plane areas read by OCR sum to {s:,.0f} sf, but the report total is "
                        f"{total_sqft:,.0f} sf. Plane table needs review; totals are taken from page 1.",
                        "total_area_sqft")
        else:
            result.flag("plane_area_match", "info",
                        f"Cross-check passed: {len(rows)} plane areas sum to {s:,.0f} sf, matching the report "
                        f"total (OCR pass: {variant}).", "total_area_sqft")
    iwb = result.measurements.get("ice_water_sqft")
    if iwb and iwb.value and rows:
        s = sum(r["iwb_sqft"] or 0 for r in rows)
        if abs(s - iwb.value) > 5:
            result.flag("plane_iwb_mismatch", "warning",
                        f"Per-plane IWB values read by OCR sum to {s:,.0f} sf, but the report total is "
                        f"{iwb.value:,.0f} sf.", "ice_water_sqft")
        else:
            result.flag("plane_iwb_match", "info",
                        f"Cross-check passed: per-plane IWB values sum to {s:,.0f} sf, matching the report total.",
                        "ice_water_sqft")


def parse(pages: list[Page], result: ExtractionResult) -> None:
    first = pages[0]
    text = first.text

    for pattern, key, mult in PAGE1_FIELDS:
        value, line = find_num(pattern, text, re.IGNORECASE | re.MULTILINE)
        result.set(key, None if value is None else round(value * mult, 2), first.method, first.number, line)

    m = re.search(r"\b(\d+\s+[^\n,]+,\s*[A-Za-z .]+,\s*[A-Z]{2}\s+\d{5}(?:,\s*USA)?)", text)
    if m:
        result.address = m.group(1).strip()
    m = re.search(r"\|\s*(\d{1,2}-\d{1,2}-\d{2})\s*\|", text)
    if m:
        result.report_date = parse_date(m.group(1), ["%m-%d-%y"])

    m = re.search(r"Standard Slope\s*\((\d+:12)\s*-\s*(\d+:12)\)", text)
    if m:
        result.flag("slope_category", "info", f"RoofScope lists the roof as standard slope ({m.group(1)} to {m.group(2)}).")

    if len(pages) > 1:
        _parse_plane_page(pages[1], result)
    else:
        result.flag("plane_page_missing", "warning", "Plane table page not found; pitch is unknown.", "predominant_pitch")

    if any(p.method == "ocr" for p in pages):
        result.flag("ocr_used", "warning",
                    "This report has no text layer. Values were read with OCR and should be checked against the PDF.")
