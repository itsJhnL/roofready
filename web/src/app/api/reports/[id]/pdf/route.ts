import { NextResponse } from "next/server";
import { BUCKET, db } from "@/lib/db";

export const runtime = "nodejs";

/** Redirect to a short-lived signed URL for the original PDF. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await db().from("reports").select("storage_path").eq("id", id).maybeSingle();
  if (r.error || !r.data) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  const signed = await db().storage.from(BUCKET).createSignedUrl(r.data.storage_path, 300);
  if (signed.error) return NextResponse.json({ error: signed.error.message }, { status: 500 });
  return NextResponse.redirect(signed.data.signedUrl);
}
