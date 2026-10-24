# RoofReady AI — Measurement Extraction Prototype

Paid technical test for Titan Roofing USA. The prototype:

1. Uploads roof measurement PDFs (GAF QuickMeasure and RoofScope).
2. Extracts the key roof measurements into one common format.
3. Shows them on a review screen where every value can be corrected.
4. Flags missing, uncertain and inconsistent values.
5. Calculates material quantities with configurable formulas (no AI in the math).
6. Saves measurements, corrections (with audit trail) and calculations in Supabase/PostgreSQL.

Sample data only. It has no connection to any live company system.

---

## How it works

```
 Browser (Next.js UI)
   │  upload PDF
   ▼
 Next.js API routes (TypeScript) ──── Supabase (PostgreSQL + Storage)
   │  POST /extract
   ▼
 Extractor service (Python, FastAPI)
   text layer → pdfplumber
   no text    → Poppler render + Tesseract OCR
   provider-specific parser → normalized measurements + flags
```

### 1. Extraction (`extractor/`, Python)

| Step | What happens |
|---|---|
| Read pages | Each page's text layer is read with pdfplumber. A page with no real text is rendered at 300 dpi and read with Tesseract OCR. |
| Detect provider | Keyword rules. RoofScope is checked **before** GAF because RoofScope reports also carry Nearmap imagery credits. |
| Parse | One parser per provider (`app/providers/*.py`) maps that provider's labels to a shared schema in canonical units (sf, lf, pitch/12). RoofScope "SQ" is converted to sf. |
| Confidence | Text layer = **high**, OCR = **medium**, calculated from other values = **derived**, not in report = **missing**. Every value keeps its page number and the exact source line. |
| Self-checks | RoofScope's per-plane table is OCR'd in several passes (upscaled/binarized/grayscale). The first pass whose plane areas add up to the page 1 total is used. If none reconcile, the table is flagged and totals come from page 1. |

**What the samples contained**

| | GAF QuickMeasure (83 Wedgewood Ln) | RoofScope (121 2nd Ave W) |
|---|---|---|
| PDF type | Text layer, 7 pages | Image-only scan, 2 pages → OCR |
| Totals taken from | Summary page (p.7) | Project Totals (p.1) |
| Pitch | Summary page + pitch breakdown | Plane table / pitch totals (p.2) |
| Area unit | sq ft | squares (converted ×100) |
| Suggested waste | 13% (located by the position of the "Suggested" label) | not provided → default |
| Notes | "Flash" = level-edge (headwall/apron) flashing per the report's note 4. TOC lists a page 8 that does not exist. | Report dated 2025-10-24 (flagged as old). All values OCR → medium confidence. |

### 2. Review and validation (`web/src/lib/validate.ts`)

Validation runs **live** while the user edits and again **on the server** before approval.

* **Errors (block approval):** required field missing (area, eaves, rakes, ridges, hips, valleys), negative or non-numeric values, pitch over 24/12.
* **Warnings:**
  * Low-slope area.
  * Pitch below 2/12.
  * Area that looks like squares instead of sf.
  * OCR values.
  * Old reports.
  * Cross-check mismatches.
* **Cross-checks** against the provider's own totals:
  * Drip edge, perimeter and starter should each equal eaves + rakes.
  * Ridge cap should equal ridges + hips.
  * Pitch-breakdown areas should add up to total area.

A misread value usually breaks one of these, which is how the system catches it without AI.

Corrections keep the original `extracted_value`, store the new `value`, and write a row to `measurement_corrections` with an optional note. Editing an approved report sends it back to review.

### 3. Material calculation (`web/src/lib/calc.ts`)

A pure TypeScript function: the same inputs and settings always give the same output. Only **approved** measurements are used. Intermediate values are exact; only the final purchase quantity is rounded **up**. Every line shows its working.

| Material | Formula | Unit |
|---|---|---|
| Waste % | Provider suggested waste if present and enabled, else default (10%) | — |
| Shingles | area × (1 + waste) ÷ 100 × bundles per square (3) | bundles |
| Starter strip | (eaves + rakes) ÷ LF per bundle (120) | bundles |
| Hip & ridge cap | (ridges + hips) ÷ LF per bundle (25) | bundles |
| Ice & water barrier | reported sf, **or** reported LF × roll width (3 ft), **or** eaves × 6 ft + valleys × 3 ft; **plus** full low-slope area (optional) ÷ sf per roll (200) | rolls |
| Synthetic underlayment | area × (1 + 10%) ÷ sf per roll (1,000). Full deck, IWB not subtracted (conservative) | rolls |
| Drip edge | (eaves + rakes) × (1 + 10%) ÷ piece length (10 ft) | pieces |
| Step / headwall flashing | LF from report, rounded up | lf |

**All numbers in this table are editable defaults** on the *Calculation settings* page. They are common industry values, not Titan Roofing's own figures, and should be replaced with the company's real numbers. Each calculation saves a snapshot of the inputs and settings it used, so changing a setting never changes a past result.

**Results for the samples (default settings)**

| | GAF (83 Wedgewood Ln) | RoofScope (121 2nd Ave W) |
|---|---|---|
| Shingles | 89 bundles (13% waste) | 662 bundles (10% waste) |
| Starter | 3 bundles | 10 bundles |
| Hip & ridge cap | 5 bundles | 21 bundles |
| Ice & water | 11 rolls (1,740 sf + 292 sf low slope) | 24 rolls (4,725 sf) |
| Underlayment | 3 rolls | 23 rolls |
| Drip edge | 40 pieces | 126 pieces |
| Step flashing | 98 lf | 224 lf |
| Headwall flashing | 55 lf | 94 lf |

### Assumptions to confirm later

* GAF "Leak Barrier 580 ft" is read as linear feet of a 3 ft roll (1,740 sf). The report does not say how it was calculated.
* Low-slope (below 4/12) areas get full ice & water coverage (setting `low_slope_full_iwb`).
* Underlayment covers the full deck.
* Flashing is passed through in linear feet. Converting it to pieces needs Titan's product sizes.
* Labor, pricing and margins were outside this test's scope.

---

## Project structure

```
extractor/                  Python extraction service
  app/main.py               FastAPI: POST /extract, GET /health
  app/pdf_io.py             text layer / OCR per page
  app/schema.py             normalized measurement schema
  app/providers/            detection + one parser per provider
  app/cli.py                run extraction from the command line
  tests/test_extract.py     regression tests against the samples
  Dockerfile
web/                        Next.js 15 + TypeScript app
  src/lib/calc.ts           calculation engine (+ calc.test.ts)
  src/lib/validate.ts       validation rules   (+ validate.test.ts)
  src/lib/db.ts             Supabase access (server only)
  src/app/                  pages: reports list/upload, review, settings
  src/app/api/              upload, corrections, approve, calculate, settings
supabase/migrations/0001_init.sql   tables, default settings, storage bucket
samples/                    put the sample PDFs here (not committed)
```

---

## Setup

### Requirements

* Node.js 20+
* Python 3.11+ with **Tesseract** and **Poppler** installed
  * macOS: `brew install tesseract poppler`
  * Ubuntu: `sudo apt install tesseract-ocr poppler-utils`
  * Windows: use the Docker option below
* A Supabase project (the free tier is fine)

### 1. Database

In the Supabase dashboard, open **SQL Editor**, paste the contents of `supabase/migrations/0001_init.sql` and run it. This creates the tables, the default settings and the private `reports` storage bucket.

### 2. Extraction service

```bash
cd extractor
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Or with Docker (includes Tesseract and Poppler):

```bash
cd extractor
docker build -t roofready-extractor .
docker run -p 8000:8000 roofready-extractor
```

Check it: open http://127.0.0.1:8000/health, or run `python -m app.cli ../samples/<file>.pdf` to see the extracted JSON.

### 3. Web app

```bash
cd web
cp .env.example .env.local     # then fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev
```

Open http://localhost:3000, drop both PDFs on the upload box, then open each report to review, approve and calculate.

> Use `127.0.0.1` (not `localhost`) for `EXTRACTOR_URL`. Node can resolve `localhost` to IPv6 while uvicorn listens on IPv4.

### Tests

```bash
cd extractor && pytest           # 5 tests: both sample reports, provider detection, API
cd web && npm test               # 19 tests: calculation engine + validation rules
```

The extractor tests need the sample PDFs in `samples/` named `gaf_quickmeasure_83_wedgewood.pdf` and `roofscope_121_2nd_ave_w.pdf`. They are skipped otherwise.

---

## Security notes (prototype)

* The service role key is used only on the server. The browser never talks to Supabase directly, and RLS is enabled with no public policies.
* There is no user login in this prototype. Authentication and roles (estimator / production manager) are the first thing to add for real use.
* The extractor accepts an optional `EXTRACTOR_API_KEY` shared secret.

## Adding a new provider (e.g. EagleView, Hover, Roofr)

1. Add `extractor/app/providers/<name>.py` with `PROVIDER`, `LABEL`, `matches(text)` and `parse(pages, result)`.
2. Register it in `PROVIDERS` in `providers/__init__.py`. More specific providers go first.
3. Add a sample PDF and a regression test.

The web app, validation and calculations need no changes, because every provider outputs the same schema.

## Where AI fits later

AI could be used as a **fallback** to locate values in unknown report layouts, or to summarize flags for the production handoff. Its output would always go through the same review screen and validation rules, and it would never do the material math.
