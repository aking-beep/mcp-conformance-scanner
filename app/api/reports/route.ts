import { NextResponse } from "next/server";
import { z } from "zod";
import { saveReport, storeStatus } from "@/lib/reports/store";
import type { ScanReport } from "@/lib/mcp/types";
import { LIMITS, clientIp, rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";

const Schema = z.object({
  report: z.record(z.unknown()),
  email: z.string().email().optional(),
});

/** Explicit opt-in save. Returns a permalink when a store backend is configured. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`reports:${ip}`, LIMITS.reports.limit, LIMITS.reports.windowMs);
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A ScanReport object is required." }, { status: 400 });
  }

  const report = parsed.data.report as unknown as ScanReport;
  if (!report?.id || !report?.overall || !report?.target) {
    return NextResponse.json({ error: "Report is missing required fields (id, overall, target)." }, { status: 400 });
  }

  if (JSON.stringify(report).length > 250_000) {
    return NextResponse.json({ error: "Report payload too large." }, { status: 413 });
  }

  try {
    const saved = await saveReport(report, parsed.data.email);
    if (!saved) {
      return NextResponse.json({
        ok: false,
        stored: false,
        store: storeStatus(),
        note: "Report storage is not configured. Set UPSTASH_REDIS_REST_URL/TOKEN or REPORT_STORE_DIR.",
      });
    }
    return NextResponse.json({
      ok: true,
      stored: true,
      id: saved.id,
      url: saved.url,
      store: saved.store,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Could not save report: ${e?.message ?? String(e)}` },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    name: "MCP saved reports",
    ...storeStatus(),
    usage: "POST /api/reports { report, email? } → { id, url }",
  });
}
