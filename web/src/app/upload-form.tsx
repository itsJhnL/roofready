"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Item {
  name: string;
  state: "uploading" | "done" | "error";
  message?: string;
  id?: string;
}

export default function UploadForm() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const busy = items.some((i) => i.state === "uploading");

  async function upload(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!list.length) return;
    setItems(list.map((f) => ({ name: f.name, state: "uploading" })));
    // Sequential: OCR is CPU-heavy, and errors stay attached to the right file.
    for (const [i, file] of list.entries()) {
      const form = new FormData();
      form.append("file", file);
      let update: Item;
      try {
        const res = await fetch("/api/reports", { method: "POST", body: form });
        const body = await res.json();
        update = res.ok
          ? { name: file.name, state: "done", id: body.id, message: `${body.provider} · ${body.address ?? "address not found"}` }
          : { name: file.name, state: "error", message: body.error ?? res.statusText };
      } catch (e) {
        update = { name: file.name, state: "error", message: (e as Error).message };
      }
      setItems((prev) => prev.map((p, j) => (j === i ? update : p)));
    }
    router.refresh();
  }

  return (
    <div>
      <label
        className={`dropzone ${drag ? "active" : ""}`}
        style={{ display: "block" }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) upload(e.dataTransfer.files); }}
      >
        <strong>Drop PDF reports here</strong> or click to choose (you can select several)
        <input type="file" accept="application/pdf" multiple hidden disabled={busy}
          onChange={(e) => e.target.files && upload(e.target.files)} />
      </label>
      {items.length > 0 && (
        <ul className="flags" style={{ marginTop: 12 }}>
          {items.map((i) => (
            <li key={i.name} className={`flag ${i.state === "error" ? "error" : i.state === "done" ? "info" : "warning"}`}>
              <b>{i.state === "uploading" ? "Reading…" : i.state === "done" ? "Done" : "Failed"}</b>
              {i.name}
              {i.message && <> — {i.message}</>}
              {i.id && <> · <Link href={`/reports/${i.id}`}>Review measurements</Link></>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
