import { NextResponse } from "next/server";
import { runScan } from "@/lib/mcp/scan";
import type { Grade } from "@/lib/mcp/types";
import { LIMITS, clientIp, rateLimit } from "@/lib/security/ratelimit";
import { assertPublicHttpUrl } from "@/lib/security/ssrf";

export const runtime = "nodejs";
export const maxDuration = 60;

const GRADE_COLORS: Record<string, string> = {
  "A+": "#22c55e",
  A: "#22c55e",
  "A-": "#4ade80",
  "B+": "#84cc16",
  B: "#a3e635",
  "B-": "#facc15",
  "C+": "#fbbf24",
  C: "#f59e0b",
  "C-": "#fb923c",
  D: "#f97316",
  F: "#ef4444",
};

function svgBadge(label: string, grade: string, score: number | null) {
  // Sanitize grade/score for SVG text (no angle brackets)
  const safeGrade = String(grade).replace(/[<>&"']/g, "").slice(0, 8);
  const color = GRADE_COLORS[safeGrade] ?? "#94a3b8";
  const right = score != null && Number.isFinite(score) ? `${safeGrade} ${Math.round(score)}` : safeGrade;
  const leftW = 118;
  const rightW = 54 + (score != null ? 18 : 0);
  const w = leftW + rightW;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${label}: ${right}">
  <title>${label}: ${right}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftW}" height="20" fill="#555"/>
    <rect x="${leftW}" width="${rightW}" height="20" fill="${color}"/>
    <rect width="${w}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="110">
    <text x="${(leftW / 2) * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(leftW - 10) * 10}">${label}</text>
    <text x="${(leftW / 2) * 10}" y="140" transform="scale(.1)" textLength="${(leftW - 10) * 10}">${label}</text>
    <text x="${(leftW + rightW / 2) * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(rightW - 10) * 10}">${right}</text>
    <text x="${(leftW + rightW / 2) * 10}" y="140" transform="scale(.1)" textLength="${(rightW - 10) * 10}">${right}</text>
  </g>
</svg>`;
}

/**
 * Conformance badge for READMEs.
 * Live scans are rate-limited + SSRF-guarded. Prefer ?grade= for static badges.
 */
export async function GET(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`badge:${ip}`, LIMITS.badge.limit, LIMITS.badge.windowMs);
  if (!rl.ok) {
    const body = svgBadge("mcp conformance", "…", null);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
      },
    });
  }

  const { searchParams } = new URL(req.url);
  const gradeParam = searchParams.get("grade");
  const scoreParam = searchParams.get("score");
  const url = searchParams.get("url");
  const repo = searchParams.get("repo");
  const image = searchParams.get("image");

  let grade: Grade | string = "F";
  let score: number | null = null;

  if (gradeParam && !url && !repo && !image) {
    grade = gradeParam.toUpperCase();
    score = scoreParam != null ? Number(scoreParam) : null;
  } else if (url || repo || image) {
    try {
      if (url) await assertPublicHttpUrl(url);
      const report = await runScan(
        url
          ? { kind: "endpoint", url }
          : image
          ? { kind: "docker", image }
          : { kind: "github", repo: repo! },
      );
      grade = report.overall.grade;
      score = report.overall.score;
    } catch {
      grade = "?";
      score = null;
    }
  } else {
    return NextResponse.json(
      {
        error: "Provide ?url=, ?repo=, ?image=, or ?grade= (optional &score=).",
        example: "/api/badge?grade=A&score=94",
      },
      { status: 400 },
    );
  }

  const body = svgBadge("mcp conformance", String(grade), Number.isFinite(score as number) ? score : null);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
