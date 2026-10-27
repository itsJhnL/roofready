"""Read a PDF page by page: use the embedded text layer when it exists, OCR otherwise."""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Optional

import pdfplumber
import pytesseract
from pdf2image import convert_from_bytes
from PIL import Image

OCR_DPI = 300
MIN_TEXT_CHARS = 40  # a page with less real text than this is treated as scanned


@dataclass
class Page:
    number: int  # 1-based
    text: str
    method: str  # "text" | "ocr"
    words: list[dict]  # pdfplumber words with coordinates (text pages only)
    image: Optional[Image.Image] = None  # rendered page (OCR pages only)


def ocr_image(image: Image.Image, psm: int = 4) -> str:
    return pytesseract.image_to_string(image, config=f"--psm {psm}")


def read_pdf(data: bytes) -> list[Page]:
    """Text pages are read directly. Image-only pages are rendered; only the FIRST one is OCR'd
    here (enough for provider detection and the summary). Later image pages carry their rendered
    image with empty text, and the provider parser OCRs just the regions it needs. This keeps
    OCR time low on small servers."""
    pages: list[Page] = []
    ocr_done = False
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for i, p in enumerate(pdf.pages, start=1):
            text = p.extract_text() or ""
            if len(text.strip()) >= MIN_TEXT_CHARS:
                pages.append(Page(i, text, "text", p.extract_words()))
                continue
            image = convert_from_bytes(data, dpi=OCR_DPI, first_page=i, last_page=i)[0]
            if not ocr_done:
                pages.append(Page(i, ocr_image(image), "ocr", [], image))
                ocr_done = True
            else:
                pages.append(Page(i, "", "ocr", [], image))
    return pages
