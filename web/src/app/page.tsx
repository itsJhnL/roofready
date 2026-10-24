import Link from "next/link";
import { listReports } from "@/lib/db";
import UploadForm from "./upload-form";

export const dynamic = "force-dynamic";

export default async function Home() {
  const reports = await listReports();
  return (
    <>
      <div className="panel">
        <h1>Upload measurement reports</h1>
        <p className="muted">
          Supported: GAF QuickMeasure and RoofScope. Text PDFs are read directly; scanned PDFs are read with OCR
          and marked for closer review.
        </p>
        <UploadForm />
      </div>

      <div className="panel">
        <h2>Reports</h2>
        {reports.length === 0 ? (
          <p className="muted">No reports yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Address</th>
                <th>Provider</th>
                <th>Read by</th>
                <th>Report date</th>
                <th>Status</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/reports/${r.id}`}>{r.address ?? r.file_name}</Link></td>
                  <td>{r.provider_label}</td>
                  <td>
                    <span className={`badge ${r.page_methods.includes("ocr") ? "ocr" : "text"}`}>
                      {r.page_methods.includes("ocr") ? "OCR" : "Text"}
                    </span>
                  </td>
                  <td>{r.report_date ?? "—"}</td>
                  <td><span className={`badge ${r.status}`}>{r.status === "approved" ? "Approved" : "Needs review"}</span></td>
                  <td className="small muted">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
