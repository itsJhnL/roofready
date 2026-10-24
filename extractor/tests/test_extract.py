"""Regression tests against the two sample reports.

Expected values were checked by hand against the PDFs. The sample PDFs are client
data and are not committed; put them in ../samples/ (see README) or the tests skip.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.pdf_io import read_pdf
from app.providers import extract

SAMPLES = Path(__file__).resolve().parents[2] / "samples"
GAF = SAMPLES / "gaf_quickmeasure_83_wedgewood.pdf"
ROOFSCOPE = SAMPLES / "roofscope_121_2nd_ave_w.pdf"


def run(path: Path) -> dict:
    if not path.exists():
        pytest.skip(f"sample not found: {path.name}")
    return extract(read_pdf(path.read_bytes())).to_dict()


def values(result: dict) -> dict:
    return {m["key"]: m["value"] for m in result["measurements"]}


def codes(result: dict) -> set:
    return {f["code"] for f in result["flags"]}


def test_gaf_quickmeasure():
    r = run(GAF)
    v = values(r)
    assert r["provider"] == "gaf_quickmeasure"
    assert r["address"] == "83 Wedgewood Ln, Whitefish, MT 59937"
    assert r["report_date"] == "2026-08-24"
    assert r["page_methods"] == ["text"] * 7
    assert v["total_area_sqft"] == 2619
    assert v["facet_count"] == 15
    assert v["predominant_pitch"] == 8
    assert (v["eaves_lf"], v["rakes_lf"], v["ridges_lf"], v["hips_lf"], v["valleys_lf"]) == (210, 145, 83, 32, 41)
    assert (v["headwall_flashing_lf"], v["step_flashing_lf"], v["drip_edge_lf"]) == (55, 98, 355)
    assert (v["ice_water_lf"], v["ridge_cap_lf"], v["starter_lf"]) == (580, 115, 355)
    assert v["suggested_waste_pct"] == 13
    assert v["low_slope_area_sqft"] == 292
    assert r["pitch_breakdown"][0] == {"pitch": 3, "area_sqft": 292, "percent": 11}
    assert len(r["waste_table"]) == 7
    assert "missing_required" not in codes(r)
    conf = {m["key"]: m["confidence"] for m in r["measurements"]}
    assert conf["total_area_sqft"] == "high"


def test_roofscope_ocr():
    r = run(ROOFSCOPE)
    v = values(r)
    assert r["provider"] == "roofscope"
    assert r["address"] == "121 2nd Ave W, Kalispell, MT 59901, USA"
    assert r["report_date"] == "2025-10-24"
    assert r["page_methods"] == ["ocr", "ocr"]
    assert v["total_area_sqft"] == 20031
    assert v["high_roof_sqft"] == 18273
    assert v["ice_water_sqft"] == 4725
    assert v["facet_count"] == 29
    assert (v["eaves_lf"], v["rakes_lf"], v["perimeter_lf"]) == (787.5, 349.7, 1137.2)
    assert (v["ridges_lf"], v["hips_lf"], v["valleys_lf"]) == (355.5, 162.0, 174.4)
    assert (v["step_flashing_lf"], v["headwall_flashing_lf"]) == (223.2, 93.5)
    assert v["predominant_pitch"] == 4
    assert v["low_slope_area_sqft"] == 0
    assert len(r["planes"]) == 29
    assert {"ocr_used", "plane_area_match", "plane_iwb_match"} <= codes(r)
    conf = {m["key"]: m["confidence"] for m in r["measurements"]}
    assert conf["total_area_sqft"] == "medium"


def test_roofscope_not_detected_as_gaf():
    """RoofScope carries Nearmap imagery credits; detection must not confuse it with GAF/Nearmap."""
    assert run(ROOFSCOPE)["provider"] == "roofscope"


def test_api_rejects_non_pdf():
    client = TestClient(app)
    res = client.post("/extract", files={"file": ("x.pdf", b"hello", "application/pdf")})
    assert res.status_code == 400


def test_api_extract():
    if not GAF.exists():
        pytest.skip("sample not found")
    client = TestClient(app)
    res = client.post("/extract", files={"file": (GAF.name, GAF.read_bytes(), "application/pdf")})
    assert res.status_code == 200
    assert res.json()["provider"] == "gaf_quickmeasure"
