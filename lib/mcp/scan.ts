// Orchestrator: turn a ScanTarget into a full ScanReport.

import { probeMcpEndpoint } from "./client";
import { runChecks } from "./checks";
import { buildCompatibility } from "./compatibility";
import { probeGithubRepo, runGithubChecks } from "./github";
import {
  buildCategoryScores,
  buildNextSteps,
  buildRecommendations,
  documentationScore,
  enterpriseReadiness,
  gradeFor,
  overallScore,
  securityScore,
} from "./scoring";
import type { ScanReport, ScanTarget } from "./types";

function reportId(): string {
  return "scan_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function finalizeReport(
  partial: Omit<ScanReport, "categories" | "compatibility" | "security" | "enterpriseReadiness" | "documentationScore" | "overall" | "recommendations" | "nextSteps"> & {
    checks: ScanReport["checks"];
    reachable: boolean;
  },
): ScanReport {
  const categories = buildCategoryScores(partial.checks);
  const overall = partial.reachable ? overallScore(categories) : 0;
  const sec = securityScore(categories);
  const docs = documentationScore(categories);

  return {
    ...partial,
    categories,
    compatibility: partial.reachable ? buildCompatibility(partial.checks) : [],
    security: { score: sec, grade: gradeFor(sec) },
    enterpriseReadiness: partial.reachable ? enterpriseReadiness(categories, overall) : 0,
    documentationScore: docs,
    overall: { score: overall, grade: gradeFor(overall) },
    recommendations: buildRecommendations(partial.checks),
    nextSteps: buildNextSteps(overall, partial.checks),
  };
}

export async function runScan(target: ScanTarget): Promise<ScanReport> {
  const createdAt = new Date().toISOString();

  if (target.kind === "docker") {
    return {
      id: reportId(),
      createdAt,
      target,
      reachable: false,
      mcpVersion: null,
      serverInfo: null,
      transport: "unknown",
      latencyMs: null,
      counts: { tools: 0, resources: 0, prompts: 0 },
      categories: [],
      checks: [],
      compatibility: [],
      security: { score: 0, grade: "F" },
      enterpriseReadiness: 0,
      documentationScore: 0,
      overall: { score: 0, grade: "F" },
      recommendations: [],
      nextSteps: [
        "Docker image scanning is on the roadmap — for now, run the image and scan its MCP endpoint URL.",
      ],
      errors: ["docker scanning is not yet implemented in this build."],
    };
  }

  if (target.kind === "github") {
    const probe = await probeGithubRepo(target.repo);
    const checks = runGithubChecks(probe);
    const next = finalizeReport({
      id: reportId(),
      createdAt,
      target: { kind: "github", repo: probe.fullName || target.repo },
      reachable: probe.reachable,
      mcpVersion: probe.signals.protocolVersionHint,
      serverInfo: probe.signals.serverInfoName
        ? { name: probe.signals.serverInfoName }
        : probe.reachable
        ? { name: probe.fullName }
        : null,
      transport: probe.signals.transportHints.includes("streamable-http")
        ? "streamable-http"
        : probe.signals.transportHints.includes("sse")
        ? "http+sse"
        : "unknown",
      latencyMs: probe.latencyMs,
      counts: {
        tools: probe.signals.toolNames.length,
        resources: probe.signals.resourceHints ? 1 : 0,
        prompts: probe.signals.promptHints ? 1 : 0,
      },
      checks,
      errors: [
        ...probe.errors,
        ...(probe.reachable
          ? [
              "Static GitHub scan — live handshake, error probes, and schemas are not executed. Follow up with an endpoint scan for a full grade.",
            ]
          : []),
      ],
    });

    // Prefer actionable next steps for static scans
    if (probe.reachable) {
      next.nextSteps = [
        "Scan the running MCP endpoint to validate handshake, errors, and live schemas.",
        ...next.nextSteps.filter((s) => !/scan the running/i.test(s)).slice(0, 4),
      ];
    }
    return next;
  }

  const probe = await probeMcpEndpoint(target.url, target.headers);
  const checks = runChecks(probe, target.url);

  const tools = probe.raw.tools?.result?.tools ?? [];
  const resources = probe.raw.resources?.result?.resources ?? [];
  const prompts = probe.raw.prompts?.result?.prompts ?? [];

  return finalizeReport({
    id: reportId(),
    createdAt,
    target,
    reachable: probe.reachable,
    mcpVersion: probe.protocolVersion,
    serverInfo: probe.serverInfo,
    transport: probe.transport,
    latencyMs: probe.initLatencyMs,
    counts: { tools: tools.length, resources: resources.length, prompts: prompts.length },
    checks,
    errors: probe.errors,
  });
}
