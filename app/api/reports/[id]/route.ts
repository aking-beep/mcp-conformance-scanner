import { NextResponse } from "next/server";
import { loadReport } from "@/lib/reports/store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const stored = await loadReport(params.id);
  if (!stored) {
    return NextResponse.json({ error: "Report not found or expired." }, { status: 404 });
  }
  return NextResponse.json({
    id: stored.id,
    createdAt: stored.createdAt,
    expiresAt: stored.expiresAt,
    report: stored.report,
  });
}
