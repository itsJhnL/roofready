"""HTTP API for the extraction service. The Next.js app calls POST /extract."""

from __future__ import annotations

import os

from fastapi import FastAPI, File, Header, HTTPException, UploadFile

from .pdf_io import read_pdf
from .providers import extract

app = FastAPI(title="RoofReady extractor", version="0.1.0")

MAX_BYTES = 25 * 1024 * 1024
API_KEY = os.environ.get("EXTRACTOR_API_KEY")  # optional shared secret


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/extract")
async def extract_pdf(file: UploadFile = File(...), x_api_key: str | None = Header(default=None)) -> dict:
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="File is not a PDF")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="PDF is larger than 25 MB")
    try:
        pages = read_pdf(data)
    except Exception as exc:  # corrupt or encrypted PDFs
        raise HTTPException(status_code=422, detail=f"Could not read PDF: {exc}") from exc
    return extract(pages).to_dict()
