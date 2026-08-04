import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const Schema = z.object({
  email: z.string().email(),
  reportId: z.string().optional(),
});

// Optional email capture. Basic scanning ALWAYS works without this.
// If EMAIL_CAPTURE_WEBHOOK_URL is unset, we no-op (and say so) so the app
// runs with zero configuration.
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

  const webhook = process.env.EMAIL_CAPTURE_WEBHOOK_URL;
  if (!webhook) {
    return NextResponse.json({
      ok: true,
      stored: false,
      note: "Email capture is not configured (EMAIL_CAPTURE_WEBHOOK_URL unset). Nothing was stored.",
    });
  }

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...parsed.data, at: new Date().toISOString() }),
    });
    return NextResponse.json({ ok: true, stored: true });
  } catch {
    return NextResponse.json({ ok: true, stored: false, note: "Capture webhook unreachable." });
  }
}
