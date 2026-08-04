import { NextResponse } from "next/server";
import { z } from "zod";
import { saveReport, storeStatus, reportPermalink } from "@/lib/reports/store";
import type { ScanReport } from "@/lib/mcp/types";

export const runtime = "nodejs";

const Schema = z.object({
  email: z.string().email(),
  reportId: z.string().optional(),
  report: z.record(z.unknown()).optional(),
});

// Optional email capture + saved report. Basic scanning ALWAYS works without this.
// Prefer saving the full report when a store backend is configured, then notify the webhook.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const { email, reportId } = parsed.data;
  const report = parsed.data.report as ScanReport | undefined;

  let saved: { id: string; url: string; store: string } | null = null;
  if (report?.id && report?.overall) {
    try {
      saved = await saveReport(report, email);
    } catch {
      /* best-effort — never fail the subscribe UX on store errors */
    }
  }

  const permalink = saved?.url || (reportId ? reportPermalink(reportId) : undefined);
  const webhook = process.env.EMAIL_CAPTURE_WEBHOOK_URL;

  if (!webhook) {
    return NextResponse.json({
      ok: true,
      stored: !!saved,
      id: saved?.id,
      url: permalink,
      store: storeStatus(),
      note: saved
        ? "Report saved. Configure EMAIL_CAPTURE_WEBHOOK_URL to also email the link."
        : "Email capture webhook is not configured. Nothing was emailed." +
          (storeStatus().kind === "none" ? " Set UPSTASH_REDIS_REST_* or REPORT_STORE_DIR to persist reports." : ""),
    });
  }

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        reportId: saved?.id || reportId,
        url: permalink,
        grade: report?.overall?.grade,
        score: report?.overall?.score,
        target: report?.target,
        at: new Date().toISOString(),
      }),
    });
    return NextResponse.json({
      ok: true,
      stored: !!saved,
      emailed: true,
      id: saved?.id,
      url: permalink,
      store: saved?.store ?? storeStatus().kind,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      stored: !!saved,
      emailed: false,
      id: saved?.id,
      url: permalink,
      note: "Capture webhook unreachable; report may still be saved.",
    });
  }
}
