import { NextResponse } from "next/server";
import { BUCKET, db } from "@/lib/db";
import { extractPdf, ExtractorError } from "@/lib/extractor";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

/** Upload a measurement PDF: store it, extract measurements, save everything for review. */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "PDF is larger than 25 MB" }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 4)) !== "%PDF") {
    return NextResponse.json({ error: "File is not a PDF" }, { status: 400 });
  }

  // 1. Extract first, so nothing is stored for a file we cannot read.
  let extraction;
  try {
    extraction = await extractPdf(new Blob([bytes], { type: "application/pdf" }), file.name);
  } catch (e) {
    const status = e instanceof ExtractorError ? 502 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }

  // 2. Store the original PDF.
  const id = crypto.randomUUID();
  const storagePath = `${id}.pdf`;
  const up = await db().storage.from(BUCKET).upload(storagePath, bytes, { contentType: "application/pdf" });
  if (up.error) return NextResponse.json({ error: `Storage upload failed: ${up.error.message}` }, { status: 500 });

  // 3. Save report, measurements and flags. Roll back on failure.
  try {
    const r = await db().from("reports").insert({
      id,
      file_name: file.name,
      storage_path: storagePath,
      provider: extraction.provider,
      provider_label: extraction.provider_label,
      address: extraction.address,
      report_date: extraction.report_date,
      page_methods: extraction.page_methods,
      pitch_breakdown: extraction.pitch_breakdown,
      planes: extraction.planes,
      waste_table: extraction.waste_table,
      raw_extraction: extraction,
    });
    if (r.error) throw new Error(r.error.message);

    const m = await db().from("measurements").insert(
      extraction.measurements.map((x) => ({
        report_id: id,
        key: x.key,
        label: x.label,
        unit: x.unit,
        extracted_value: x.value,
        value: x.value,
        confidence: x.confidence,
        method: x.method,
        source_page: x.source_page,
        source_text: x.source_text,
      })),
    );
    if (m.error) throw new Error(m.error.message);

    if (extraction.flags.length) {
      const f = await db().from("report_flags").insert(
        extraction.flags.map((x) => ({ report_id: id, source: "extractor", ...x })),
      );
      if (f.error) throw new Error(f.error.message);
    }
  } catch (e) {
    await db().from("reports").delete().eq("id", id); // cascades to measurements/flags
    await db().storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: `Saving report failed: ${(e as Error).message}` }, { status: 500 });
  }

  return NextResponse.json({ id, provider: extraction.provider_label, address: extraction.address });
}
