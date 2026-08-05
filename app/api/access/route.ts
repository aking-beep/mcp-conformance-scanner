import { NextResponse } from "next/server";
import { z } from "zod";
import {
  accessGateEnabled,
  mintAccessToken,
  saveLead,
  verifyAccessToken,
  extractAccessToken,
} from "@/lib/access/gate";
import { LIMITS, clientIp, rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";

const Schema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().email().max(200),
  company: z.string().trim().min(1).max(160),
  companySize: z.enum(["solo", "small", "mid", "enterprise"]),
  newsletter: z.boolean().default(false),
  contributeTesting: z.boolean().default(false),
});

function cookieHeader(token: string): string {
  const maxAge = 60 * 60 * 24 * 30;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `mcp_access=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/** Register / unlock scanning. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`access:${ip}`, LIMITS.access.limit, LIMITS.access.windowMs);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many signups from this network. Try later." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Please fill in all required fields." },
      { status: 400 },
    );
  }

  let lead;
  try {
    lead = await saveLead(parsed.data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Could not save signup.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  const token = mintAccessToken(lead.id, lead.email);

  return NextResponse.json(
    {
      ok: true,
      token,
      leadId: lead.id,
      gateEnabled: accessGateEnabled(),
    },
    {
      status: 200,
      headers: { "Set-Cookie": cookieHeader(token) },
    },
  );
}

/** Check whether the current browser already has access. */
export async function GET(req: Request) {
  const enabled = accessGateEnabled();
  if (!enabled) {
    return NextResponse.json({ ok: true, required: false, unlocked: true });
  }
  const auth = verifyAccessToken(extractAccessToken(req));
  return NextResponse.json({
    ok: true,
    required: true,
    unlocked: auth.ok,
    email: auth.ok ? auth.email : undefined,
  });
}
