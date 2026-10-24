import Link from "next/link";
import { notFound } from "next/navigation";
import { getReport, getSettings } from "@/lib/db";
import Review from "./review";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, settings] = await Promise.all([getReport(id), getSettings()]);
  if (!data) notFound();
  const { report } = data;

  return (
    <>
      <p className="small"><Link href="/">← All reports</Link></p>
      <div className="panel">
        <div className="row">
          <div>
            <h1>{report.address ?? report.file_name}</h1>
            <div className="muted small">
              {report.provider_label} · report date {report.report_date ?? "unknown"} · {report.page_methods.length} pages (
              {report.page_methods.includes("ocr") ? "scanned, read with OCR" : "text layer"}) · file {report.file_name}
            </div>
          </div>
          <div className="spacer" />
          <span className={`badge ${report.status}`}>{report.status === "approved" ? "Approved" : "Needs review"}</span>
          <a className="btn" href={`/api/reports/${report.id}/pdf`} target="_blank" rel="noreferrer">Open original PDF</a>
        </div>
      </div>
      <Review
        report={report}
        measurements={data.measurements}
        extractorFlags={data.flags.filter((f) => f.source === "extractor")}
        latestCalculation={data.latestCalculation}
        lowSlopeThreshold={settings.low_slope_threshold ?? 4}
      />
    </>
  );
}
