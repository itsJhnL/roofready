import type { Flag, MeasurementKey, PitchRow, PlaneRow } from "./types";

export interface ExtractedMeasurement {
  key: MeasurementKey;
  label: string;
  unit: string;
  value: number | null;
  confidence: "high" | "medium" | "low" | "derived" | "missing";
  method: string;
  source_page: number | null;
  source_text: string | null;
}

export interface ExtractionResponse {
  provider: string;
  provider_label: string;
  address: string | null;
  report_date: string | null;
  page_methods: string[];
  measurements: ExtractedMeasurement[];
  pitch_breakdown: PitchRow[];
  planes: PlaneRow[];
  waste_table: { waste_pct: number; area_sqft?: number; squares?: number }[];
  flags: Flag[];
}

export class ExtractorError extends Error {}

/** Send a PDF to the Python extraction service. */
export async function extractPdf(file: Blob, fileName: string): Promise<ExtractionResponse> {
  const base = process.env.EXTRACTOR_URL ?? "http://127.0.0.1:8000";
  const form = new FormData();
  form.append("file", file, fileName);
  const headers: Record<string, string> = {};
  if (process.env.EXTRACTOR_API_KEY) headers["x-api-key"] = process.env.EXTRACTOR_API_KEY;

  let res: Response;
  try {
    res = await fetch(`${base}/extract`, { method: "POST", body: form, headers, signal: AbortSignal.timeout(120_000) });
  } catch (e) {
    throw new ExtractorError(`Extraction service is not reachable at ${base}. Is it running? (${(e as Error).message})`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ExtractorError(`Extraction failed (${res.status}): ${body.detail ?? res.statusText}`);
  }
  return res.json();
}
