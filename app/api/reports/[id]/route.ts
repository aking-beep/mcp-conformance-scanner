import { NextResponse } from "next/server";
import { loadReport } from "@/lib/reports/store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const stored = await loadReport(id);
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
