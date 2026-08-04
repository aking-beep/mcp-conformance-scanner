// Shared types for the MCP Conformance Scanner.

export type ScanTarget =
  | { kind: "endpoint"; url: string; headers?: Record<string, string> }
  | { kind: "github"; repo: string }
  | { kind: "docker"; image: string };

export type CheckStatus = "pass" | "warn" | "fail" | "skip";

export interface CheckResult {
  /** Stable id, e.g. "protocol.version" */
  id: string;
  /** Which category this rolls up into. */
  category: CheckCategory;
  label: string;
  status: CheckStatus;
  /** Short human summary of the finding. */
  detail: string;
  /** 0..1 weight of this check inside its category. */
  weight: number;
  /** 0..1 score this check earned (pass=1, warn=0.5, fail=0, skip excluded). */
  score: number;
  /** Optional remediation shown in Recommendations. */
  fix?: string;
  /** Optional evidence blob for the shareable report. */
  evidence?: unknown;
}

export type CheckCategory =
  | "protocol"
  | "tools"
  | "resources"
  | "prompts"
  | "errors"
  | "auth"
  | "streaming"
  | "security"
  | "docs";

export interface CategoryScore {
  category: CheckCategory;
  label: string;
  score: number; // 0..100
  weightPct: number; // contribution to overall
  checks: CheckResult[];
}

export type Grade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-" | "D" | "F";

export interface CompatibilityRow {
  platform: "Claude" | "OpenAI" | "Gemini" | "Bedrock";
  status: CheckStatus;
  note: string;
}

export interface Recommendation {
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
}

export interface ScanReport {
  id: string;
  createdAt: string;
  target: ScanTarget;
  reachable: boolean;
  /** Detected MCP protocol version, if any. */
  mcpVersion: string | null;
  serverInfo: { name?: string; version?: string } | null;
  transport: "streamable-http" | "http+sse" | "unknown";
  latencyMs: number | null;
  counts: { tools: number; resources: number; prompts: number };
  categories: CategoryScore[];
  checks: CheckResult[];
  compatibility: CompatibilityRow[];
  security: { score: number; grade: Grade };
  enterpriseReadiness: number; // 0..100
  documentationScore: number; // 0..100
  overall: { score: number; grade: Grade };
  recommendations: Recommendation[];
  nextSteps: string[];
  errors: string[];
}
