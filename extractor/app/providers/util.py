from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

NUM = r"(\d[\d,]*(?:\.\d+)?)"


def to_num(s: str) -> float:
    return float(s.replace(",", ""))


def find_num(pattern: str, text: str, flags: int = re.IGNORECASE) -> tuple[Optional[float], Optional[str]]:
    """Return (number, matched line) for the first match of `pattern` (which must contain one NUM group)."""
    m = re.search(pattern, text, flags)
    if not m:
        return None, None
    line_start = text.rfind("\n", 0, m.start()) + 1
    line_end = text.find("\n", m.end())
    line = text[line_start : line_end if line_end != -1 else len(text)].strip()
    return to_num(m.group(1)), line


def parse_date(s: str, formats: list[str]) -> Optional[str]:
    for fmt in formats:
        try:
            return datetime.strptime(s.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None
