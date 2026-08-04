import { NextResponse } from "next/server";
import { z } from "zod";
import {
  accessGateEnabled,
  extractAccessToken,
  verifyAccessToken,
} from "@/lib/access/gate";
import { runScan } from "@/lib/mcp/scan";
import type { ScanTarget } from "@/lib/mcp/types";
import { LIMITS, clientIp, rateLimit } from "@/lib/security/ratelimit";
import { assertPublicHttpUrl, sanitizeUserHeaders } from "@/lib/security/ssrf";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  kind: z.enum(["endpoint", "github", "docker"]).default("endpoint"),
  url: z.string().url().optional(),
  repo: z.string().optional(),
  image: z.string().optional(),
  headers: z.record(z.string()).optional(),
});

function toTarget(b: z.infer<typeof BodySchema>): ScanTarget | { error: string } {
  if (b.kind === "endpoint") {
    if (!b.url) return { error: "An MCP endpoint URL is required." };
    if (!/^https?:\/\//i.test(b.url)) return { error: "URL must start with http:// or https://" };
    return { kind: "endpoint", url: b.url, headers: sanitizeUserHeaders(b.headers) };
  }
  if (b.kind === "github") {
    if (!b.repo) return { error: "A GitHub repo (owner/name or URL) is required." };
    return { kind: "github", repo: b.repo };
  }
  if (!b.image) return { error: "A Docker image reference is required." };
  return { kind: "docker", image: b.image };
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`scan:${ip}`, LIMITS.scan.limit, LIMITS.scan.windowMs);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  if (accessGateEnabled()) {
    const token = extractAccessToken(req);
    const auth = verifyAccessToken(token);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error, code: "access_required" },
        { status: 401 },
      );
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  }

  const target = toTarget(parsed.data);
  if ("error" in target) {
    return NextResponse.json({ error: target.error }, { status: 400 });
  }

  if (target.kind === "endpoint") {
    try {
      await assertPublicHttpUrl(target.url);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? "URL not allowed." }, { status: 400 });
    }
  }

  try {
    const report = await runScan(target);
    return NextResponse.json(report, {
      status: 200,
      headers: { "X-RateLimit-Remaining": String(rl.remaining) },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Scan failed: ${e?.message ?? String(e)}` },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    name: "MCP Conformance Scanner API",
    version: "0.7.0",
    accessGate: accessGateEnabled(),
    usage: "POST /api/scan { kind: 'endpoint', url: 'https://your-server/mcp' }",
    docs: "/docs",
  });
}
