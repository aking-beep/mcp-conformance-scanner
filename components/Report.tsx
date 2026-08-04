"use client";

import { useState } from "react";
import type { ScanReport } from "@/lib/mcp/types";
import { EmailCapture } from "./EmailCapture";
import { Gauge, GradeBadge, ScoreBar, StatusChip, colorForScore, statusMeta } from "./visuals";

function HeadlineChip({ label, status, note }: { label: string; status: "pass" | "warn" | "fail"; note: string }) {
  const m = statusMeta(status);
  return (
    <div className="card p-3.5 flex items-start gap-3">
      <span
        className="mt-0.5 grid place-items-center h-6 w-6 rounded-lg font-bold text-sm shrink-0"
        style={{ color: m.color, background: m.color + "18" }}
      >
        {m.glyph}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="text-xs text-sub truncate" title={note}>{note}</div>
      </div>
    </div>
  );
}

function findCheck(r: ScanReport, id: string) {
  return r.checks.find((c) => c.id === id);
}

export function Report({ report }: { report: ScanReport }) {
  const [copied, setCopied] = useState<string | null>(null);

  if (!report.reachable) {
    return (
      <div className="card p-6 animate-fade-up border-bad/40">
        <div className="flex items-center gap-3">
          <GradeBadge grade="F" size="sm" />
          <div>
            <div className="font-semibold">Could not scan this target</div>
            <div className="text-sm text-sub">
              {report.errors[0] ?? "The endpoint did not complete an MCP handshake."}
            </div>
          </div>
        </div>
        {report.nextSteps.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-sm text-sub list-disc pl-5">
            {report.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        )}
      </div>
    );
  }

  // Build the headline quick-scan chips (mirrors the product spec).
  const chip = (id: string, label: string, fallback: string) => {
    const c = findCheck(report, id);
    const st = c ? (c.status === "skip" ? "warn" : c.status) : "warn";
    return <HeadlineChip key={id} label={label} status={st as any} note={c?.detail ?? fallback} />;
  };

  async function copy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* ignore */
    }
  }

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}#${btoa(unescape(encodeURIComponent(JSON.stringify(report)))).slice(0, 12)}`
      : "";

  return (
    <div className="space-y-6">
      {/* Headline */}
      <div className="card p-6 animate-fade-up">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex items-center gap-5">
            <GradeBadge grade={report.overall.grade} />
            <div>
              <div className="text-xs uppercase tracking-wide text-sub">Overall grade</div>
              <div className="text-2xl font-bold">{report.overall.score}/100</div>
              <div className="text-sm text-sub mt-1">
                {report.serverInfo?.name ?? "MCP server"}
                {report.serverInfo?.version ? ` v${report.serverInfo.version}` : ""}
                {report.mcpVersion ? ` · protocol ${report.mcpVersion}` : ""}
              </div>
            </div>
          </div>

          <div className="md:ml-auto grid grid-cols-3 gap-6">
            <div className="text-center">
              <Gauge score={report.security.score} size={104} label="Security" />
            </div>
            <div className="text-center">
              <Gauge score={report.enterpriseReadiness} size={104} label="Enterprise" />
            </div>
            <div className="text-center">
              <Gauge score={report.documentationScore} size={104} label="Docs" />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 text-xs text-sub">
          <span className="pill">Transport: {report.transport}</span>
          <span className="pill">
            {report.target.kind === "github"
              ? "Scan: static GitHub"
              : report.target.kind === "docker"
              ? "Scan: Docker/OCI"
              : `Latency: ${report.latencyMs ?? "?"}ms`}
          </span>
          <span className="pill">{report.counts.tools} tools</span>
          <span className="pill">{report.counts.resources} resources</span>
          <span className="pill">{report.counts.prompts} prompts</span>
        </div>
        {report.target.kind === "github" && (
          <p className="mt-3 text-xs text-warn">
            Static repository analysis — live handshake, error probes, and schema validation need an endpoint scan.
          </p>
        )}
        {report.target.kind === "docker" && (
          <p className="mt-3 text-xs text-warn">
            Image metadata analysis — tools, schemas, and JSON-RPC error probes need a running MCP endpoint.
          </p>
        )}
      </div>

      {/* Quick-scan chips */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {chip("protocol.version", "MCP version", "Version detection")}
        {chip("auth.scheme", "Authentication", "OAuth / bearer")}
        {chip("streaming.support", "Streaming", "SSE support")}
        {chip("tools.schema", "Schema validation", "Tool input schemas")}
        {chip("security.injection", "Prompt-injection protection", "Injection surface")}
        {chip("errors.unknownMethod", "Error handling", "JSON-RPC errors")}
      </div>

      {/* Compatibility matrix */}
      <div className="card p-5">
        <h3 className="font-semibold mb-4">Model compatibility</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {report.compatibility.map((row) => {
            const m = statusMeta(row.status);
            return (
              <div key={row.platform} className="rounded-xl border border-line p-4 bg-panel2/50">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{row.platform}</span>
                  <span style={{ color: m.color }} className="font-bold">{m.glyph}</span>
                </div>
                <p className="text-xs text-sub mt-2 leading-relaxed">{row.note}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category breakdown */}
      <div className="card p-5">
        <h3 className="font-semibold mb-4">Conformance breakdown</h3>
        <div className="space-y-5">
          {report.categories
            .filter((cat) => cat.checks.some((c) => c.status !== "skip"))
            .map((cat) => (
              <div key={cat.category}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-medium w-40 shrink-0">{cat.label}</span>
                  <div className="flex-1"><ScoreBar score={cat.score} /></div>
                  <span className="text-sm font-semibold w-12 text-right" style={{ color: colorForScore(cat.score) }}>
                    {cat.score}
                  </span>
                </div>
                <div className="pl-0 md:pl-40 space-y-1.5">
                  {cat.checks
                    .filter((c) => c.status !== "skip")
                    .map((c) => {
                      const m = statusMeta(c.status);
                      return (
                        <div key={c.id} className="flex items-start gap-2 text-sm">
                          <span style={{ color: m.color }} className="font-bold w-4 shrink-0">{m.glyph}</span>
                          <span className="text-ink/90">{c.label}</span>
                          <span className="text-sub">— {c.detail}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Recommendations */}
      {report.recommendations.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold mb-4">Recommendations</h3>
          <div className="space-y-2.5">
            {report.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-line p-3 bg-panel2/40">
                <StatusChip status={rec.priority === "high" ? "fail" : rec.priority === "medium" ? "warn" : "pass"} text={rec.priority} />
                <div>
                  <div className="text-sm font-medium">{rec.title}</div>
                  <div className="text-sm text-sub">{rec.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next steps */}
      {report.nextSteps.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold mb-3">Next steps</h3>
          <ol className="space-y-2 text-sm text-ink/90 list-decimal pl-5">
            {report.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
      )}

      {/* Share + save */}
      <div className="card p-5">
        <h3 className="font-semibold mb-3">Share this report</h3>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => copy(JSON.stringify(report, null, 2), "json")}>
            {copied === "json" ? "Copied!" : "Copy JSON"}
          </button>
          <button
            className="btn-ghost"
            onClick={() => {
              const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `mcp-report-${report.id}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download report
          </button>
          <button className="btn-ghost" onClick={() => copy(shareUrl, "link")}>
            {copied === "link" ? "Link copied!" : "Copy share link"}
          </button>
        </div>
        <div className="mt-5 border-t border-line pt-5">
          <EmailCapture reportId={report.id} />
        </div>
      </div>
    </div>
  );
}
