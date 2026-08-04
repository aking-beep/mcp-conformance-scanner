// Orchestrator: turn a ScanTarget into a full ScanReport.

import { probeMcpEndpoint } from "./client";
import { runChecks } from "./checks";
import { buildCompatibility } from "./compatibility";
import { probeDockerImage, runDockerChecks } from "./docker";
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

function transportFromHints(
  hints: Array<"stdio" | "sse" | "streamable-http" | "http">,
): ScanReport["transport"] {
  if (hints.includes("streamable-http")) return "streamable-http";
  if (hints.includes("sse")) return "http+sse";
  return "unknown";
}

export async function runScan(target: ScanTarget): Promise<ScanReport> {
  const createdAt = new Date().toISOString();

  if (target.kind === "docker") {
    const probe = await probeDockerImage(target.image);
    const checks = runDockerChecks(probe);
    const next = finalizeReport({
      id: reportId(),
      createdAt,
      target: { kind: "docker", image: probe.ref?.display || target.image },
      reachable: probe.reachable,
      mcpVersion: probe.signals.protocolVersionHint,
      serverInfo: probe.signals.serverName
        ? { name: probe.signals.serverName }
        : probe.reachable && probe.ref
        ? { name: probe.ref.display }
        : null,
      transport: transportFromHints(probe.signals.transportHints),
      latencyMs: probe.latencyMs,
      counts: { tools: 0, resources: 0, prompts: 0 },
      checks,
      errors: [
        ...probe.errors,
        ...(probe.reachable
          ? [
              "Docker/OCI metadata scan — live handshake, tools, and error probes need a running endpoint.",
            ]
          : []),
      ],
    });
    if (probe.reachable) {
      next.nextSteps = [
        "Run the image and scan its MCP endpoint URL for a full live grade.",
        ...next.nextSteps.filter((s) => !/run the image|running mcp endpoint/i.test(s)).slice(0, 4),
      ];
    }
    return next;
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
      transport: transportFromHints(probe.signals.transportHints),
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
