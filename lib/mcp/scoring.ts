// Rolls individual checks up into category scores, an overall grade, and
// derived scores (security, enterprise readiness, documentation).

import type {
  CategoryScore,
  CheckCategory,
  CheckResult,
  Grade,
  Recommendation,
} from "./types";

const CATEGORY_META: Record<CheckCategory, { label: string; weight: number }> = {
  protocol: { label: "Protocol compliance", weight: 22 },
  tools: { label: "Tools", weight: 18 },
  resources: { label: "Resources", weight: 6 },
  prompts: { label: "Prompts", weight: 6 },
  errors: { label: "Error handling", weight: 12 },
  auth: { label: "Authentication", weight: 12 },
  streaming: { label: "Streaming", weight: 6 },
  security: { label: "Security", weight: 14 },
  docs: { label: "Documentation", weight: 4 },
};

export function scoreCategory(category: CheckCategory, checks: CheckResult[]): CategoryScore {
  const relevant = checks.filter((c) => c.category === category && c.status !== "skip");
  const totalWeight = relevant.reduce((a, c) => a + c.weight, 0);
  const score =
    totalWeight === 0
      ? 100
      : Math.round((relevant.reduce((a, c) => a + c.score * c.weight, 0) / totalWeight) * 100);
  return {
    category,
    label: CATEGORY_META[category].label,
    score,
    weightPct: CATEGORY_META[category].weight,
    checks: checks.filter((c) => c.category === category),
  };
}

export function buildCategoryScores(checks: CheckResult[]): CategoryScore[] {
  return (Object.keys(CATEGORY_META) as CheckCategory[]).map((c) => scoreCategory(c, checks));
}

export function gradeFor(score: number): Grade {
  if (score >= 97) return "A+";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C-";
  if (score >= 60) return "D";
  return "F";
}

export function overallScore(categories: CategoryScore[]): number {
  // Re-normalize weights over categories that actually have graded checks
  // (a skipped category — e.g. no prompts — shouldn't drag the score down).
  const active = categories.filter((c) =>
    c.checks.some((k) => k.status !== "skip"),
  );
  const totalW = active.reduce((a, c) => a + c.weightPct, 0) || 1;
  return Math.round(active.reduce((a, c) => a + c.score * c.weightPct, 0) / totalW);
}

export function securityScore(categories: CategoryScore[]): number {
  const sec = categories.find((c) => c.category === "security");
  const auth = categories.find((c) => c.category === "auth");
  // Weighted blend: 60% security checks, 40% auth checks.
  return Math.round((sec?.score ?? 0) * 0.6 + (auth?.score ?? 0) * 0.4);
}

export function documentationScore(categories: CategoryScore[]): number {
  return categories.find((c) => c.category === "docs")?.score ?? 0;
}

export function enterpriseReadiness(categories: CategoryScore[], overall: number): number {
  // Enterprises care disproportionately about auth, security, and error handling.
  const get = (c: CheckCategory) => categories.find((x) => x.category === c)?.score ?? 0;
  const blend =
    get("auth") * 0.3 +
    get("security") * 0.3 +
    get("errors") * 0.2 +
    get("protocol") * 0.1 +
    overall * 0.1;
  return Math.round(blend);
}

export function buildRecommendations(checks: CheckResult[]): Recommendation[] {
  const priorityForCategory: Record<CheckCategory, Recommendation["priority"]> = {
    protocol: "high",
    auth: "high",
    security: "high",
    errors: "medium",
    tools: "medium",
    resources: "low",
    prompts: "low",
    streaming: "low",
    docs: "low",
  };
  return checks
    .filter((c) => (c.status === "fail" || c.status === "warn") && c.fix)
    .sort((a, b) => {
      const rank = { fail: 0, warn: 1, pass: 2, skip: 3 };
      return rank[a.status] - rank[b.status];
    })
    .map((c) => ({
      priority: c.status === "fail" ? "high" : priorityForCategory[c.category],
      title: c.label,
      detail: c.fix as string,
    }))
    .sort((a, b) => {
      const p = { high: 0, medium: 1, low: 2 };
      return p[a.priority] - p[b.priority];
    });
}

export function buildNextSteps(overall: number, checks: CheckResult[]): string[] {
  const steps: string[] = [];
  const failing = checks.filter((c) => c.status === "fail");
  const warning = checks.filter((c) => c.status === "warn");

  if (failing.length) {
    steps.push(`Fix ${failing.length} failing check${failing.length > 1 ? "s" : ""} before publishing (see high-priority recommendations).`);
  }
  if (checks.find((c) => c.id === "auth.scheme" && c.status !== "pass" && c.status !== "skip")) {
    steps.push("Add OAuth 2.1 with token refresh for any server that performs writes or accesses private data.");
  }
  if (checks.find((c) => c.id === "auth.prm" && c.status === "fail")) {
    steps.push("Publish RFC 9728 Protected Resource Metadata and point to it from WWW-Authenticate on 401.");
  }
  if (checks.find((c) => c.id === "auth.pkce" && c.status === "fail")) {
    steps.push("Advertise PKCE S256 in authorization server metadata (code_challenge_methods_supported).");
  }
  if (checks.find((c) => c.id === "auth.refresh" && c.status === "warn")) {
    steps.push("Enable the refresh_token grant so clients can renew access without a full re-login.");
  }
  if (checks.find((c) => c.id === "streaming.support" && c.status !== "pass")) {
    steps.push("Adopt Streamable HTTP (text/event-stream) so long tool calls can report progress.");
  }
  if (warning.length && !failing.length) {
    steps.push(`Clear ${warning.length} warning${warning.length > 1 ? "s" : ""} to move up a grade tier.`);
  }
  if (overall >= 90) {
    steps.push("Publish your conformance badge and submit to MCP registries with confidence.");
  } else {
    steps.push("Re-scan after each fix — the grade and compatibility matrix update live.");
  }
  return steps;
}
