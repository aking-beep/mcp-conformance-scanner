import type { CheckResult, ScanReport } from "./types";

export type Severity = "critical" | "high" | "medium" | "low";

export const SEVERITY_META: Record<
  Severity,
  { label: string; emoji: string; color: string }
> = {
  critical: { label: "Critical", emoji: "🔴", color: "#ef4444" },
  high: { label: "High", emoji: "🟠", color: "#f97316" },
  medium: { label: "Medium", emoji: "🟡", color: "#eab308" },
  low: { label: "Low", emoji: "🟢", color: "#22c55e" },
};

export function severityForCheck(check: CheckResult): Severity | null {
  if (check.status === "pass" || check.status === "skip") return null;
  if (check.status === "fail") {
    if (check.category === "security" || check.category === "auth") return "critical";
    if (check.category === "protocol" || check.category === "errors") return "high";
    return "high";
  }
  // warn
  if (check.category === "docs" || check.category === "streaming" || check.category === "prompts") {
    return "low";
  }
  return "medium";
}

export function summarizeFindings(report: ScanReport): {
  critical: number;
  high: number;
  medium: number;
  low: number;
  productionReady: boolean;
} {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const c of report.checks) {
    const s = severityForCheck(c);
    if (s) counts[s] += 1;
  }
  const productionReady =
    report.reachable &&
    counts.critical === 0 &&
    report.overall.score >= 80 &&
    report.security.score >= 70;
  return { ...counts, productionReady };
}
