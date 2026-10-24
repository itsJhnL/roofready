"""Provider registry and detection.

Order matters: RoofScope reports also carry Nearmap imagery credits, so the
more specific RoofScope check runs before the GAF/Nearmap one.
To support a new provider, add a module with PROVIDER, LABEL, matches() and parse().
"""

from __future__ import annotations

from datetime import date

from ..pdf_io import Page
from ..schema import ExtractionResult
from . import gaf_quickmeasure, roofscope

PROVIDERS = [roofscope, gaf_quickmeasure]

STALE_REPORT_DAYS = 180
LOW_SLOPE_PITCH = 4.0  # below 4/12 is low slope for shingles


def detect(pages: list[Page]):
    text = "\n".join(p.text for p in pages)
    for provider in PROVIDERS:
        if provider.matches(text):
            return provider
    return None


def extract(pages: list[Page]) -> ExtractionResult:
    provider = detect(pages)
    if provider is None:
        result = ExtractionResult(provider="unknown", provider_label="Unknown provider",
                                  page_methods=[p.method for p in pages])
        result.flag("unknown_provider", "error",
                    "This report format is not supported yet. Measurements must be entered manually.")
        result.finalize()
        return result

    result = ExtractionResult(provider=provider.PROVIDER, provider_label=provider.LABEL,
                              page_methods=[p.method for p in pages])
    provider.parse(pages, result)
    _derive(result)
    result.finalize()
    return result


def _derive(result: ExtractionResult) -> None:
    """Deterministic values derived from extracted data (never from AI)."""
    if result.pitch_breakdown:
        low = [r for r in result.pitch_breakdown if r["pitch"] < LOW_SLOPE_PITCH]
        area = round(sum(r["area_sqft"] for r in low), 2)
        detail = ", ".join(f"{r['pitch']:g}/12: {r['area_sqft']:,.0f} sf" for r in low) or "none"
        result.set("low_slope_area_sqft", area, "derived", None,
                   f"Sum of pitch-breakdown areas below {LOW_SLOPE_PITCH:g}/12 ({detail})")
        # The low-slope warning itself is raised by the web app's live validation.

    if result.report_date:
        age = (date.today() - date.fromisoformat(result.report_date)).days
        if age > STALE_REPORT_DAYS:
            result.flag("stale_report", "warning",
                        f"Report is {age} days old ({result.report_date}). Confirm no changes to the roof since then.")
