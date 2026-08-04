import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const Schema = z.object({
  message: z.string().min(1).max(4000),
  email: z.string().email().optional(),
  context: z.string().optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }

  const webhook = process.env.FEEDBACK_WEBHOOK_URL;
  const payload = { ...parsed.data, at: new Date().toISOString() };

  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: `New MCP Scanner feedback: ${JSON.stringify(payload)}` }),
      });
    } catch {
      // fall through — never fail the user's submission on a webhook hiccup
    }
  } else {
    console.log("[feedback]", payload);
  }

  return NextResponse.json({ ok: true });
}
