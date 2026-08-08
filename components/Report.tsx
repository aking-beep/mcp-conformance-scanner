"use client";

import { useState } from "react";
import type { ScanReport } from "@/lib/mcp/types";
import { reportToMarkdown } from "@/lib/mcp/markdown";
import { SEVERITY_META, severityForCheck, summarizeFindings } from "@/lib/mcp/severity";
import { EmailCapture } from "./EmailCapture";
import { ReportUseful } from "./ReportUseful";
import { Gauge, GradeBadge, ScoreBar, colorForScore, statusMeta } from "./visuals";

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
  const [saveState, setSaveState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState("");

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

  const chip = (id: string, label: string, fallback: string) => {
    const c = findCheck(report, id);
    if (c?.status === "skip") return null;
    const st = c ? c.status : "warn";
    return <HeadlineChip key={id} label={label} status={st as "pass" | "warn" | "fail"} note={c?.detail ?? fallback} />;
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

  function download(filename: string, body: string, type: string) {
    const blob = new Blob([body], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function savePermalink() {
    setSaveState("loading");
    setSaveNote("");
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ report }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      if (!data.stored || !data.url) {
        setSaveState("error");
        setSaveNote(data.note || "Report storage isn't configured on this instance.");
        return;
      }
      const abs =
        data.url.startsWith("http")
          ? data.url
          : `${window.location.origin}${data.url}`;
      setSavedUrl(abs);
      setSaveState("done");
      await copy(abs, "saved");
    } catch (e: any) {
      setSaveState("error");
      setSaveNote(e?.message ?? "Could not save report");
    }
  }

  const md = reportToMarkdown(report);
  const summary = summarizeFindings(report);

  return (
    <div className="space-y-6">
      {/* Headline */}
      <div className="card p-6 animate-fade-up">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex items-center gap-5">
            <GradeBadge grade={report.overall.grade} />
            <div>
              <div className="text-xs uppercase tracking-wide text-sub">Overall</div>
              <div className="text-3xl font-bold tracking-tight">{report.overall.score} / 100</div>
              <div className="text-lg font-semibold mt-0.5" style={{ color: colorForScore(report.overall.score) }}>
                Grade {report.overall.grade}
              </div>
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

        {/* Scan summary */}
        <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="rounded-xl border border-line bg-panel2/40 p-3">
            <div className="text-[11px] uppercase tracking-wide text-sub">Security score</div>
            <div className="text-xl font-bold mt-0.5" style={{ color: colorForScore(report.security.score) }}>
              {report.security.score}/100
            </div>
          </div>
          {(["critical", "high", "medium", "low"] as const).map((sev) => (
            <div key={sev} className="rounded-xl border border-line bg-panel2/40 p-3">
              <div className="text-[11px] uppercase tracking-wide text-sub flex items-center gap-1">
                <span>{SEVERITY_META[sev].emoji}</span> {SEVERITY_META[sev].label}
              </div>
              <div className="text-xl font-bold mt-0.5" style={{ color: SEVERITY_META[sev].color }}>
                {summary[sev]}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="pill font-medium"
            style={{
              color: summary.productionReady ? "#22c55e" : "#f59e0b",
              borderColor: summary.productionReady ? "rgba(34,197,94,.35)" : "rgba(245,158,11,.35)",
            }}
          >
            Production ready: {summary.productionReady ? "Yes" : "Not yet"}
          </span>
          <span className="text-xs text-sub">Based on critical findings, overall score, and security score.</span>
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
        {chip("auth.prm", "OAuth PRM", "Protected resource metadata")}
        {chip("auth.pkce", "PKCE S256", "AS metadata")}
        {chip("streaming.support", "Streaming", "SSE support")}
        {chip("tools.schema", "Schema validation", "Tool input schemas")}
        {chip("security.injection", "Prompt-injection protection", "Injection surface")}
        {chip("errors.unknownMethod", "Error handling", "JSON-RPC errors")}
        {chip("auth.refresh", "Token refresh", "refresh_token grant")}
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
          <h3 className="font-semibold mb-1">Recommendations</h3>
          <p className="text-sm text-sub mb-4">Issue → why it matters → suggested fix → reference.</p>
          <div className="space-y-3">
            {report.recommendations.map((rec, i) => {
              const check = rec.checkId ? report.checks.find((c) => c.id === rec.checkId) : undefined;
              const sev = check ? severityForCheck(check) : rec.priority === "high" ? "high" : rec.priority === "medium" ? "medium" : "low";
              const meta = sev ? SEVERITY_META[sev] : SEVERITY_META.medium;
              return (
                <div key={i} className="rounded-xl border border-line p-4 bg-panel2/40 space-y-3">
                  <div className="flex items-start gap-3">
                    <span
                      className="pill shrink-0 font-medium"
                      style={{ color: meta.color, borderColor: meta.color + "55" }}
                    >
                      {meta.emoji} {meta.label}
                    </span>
                    <div className="text-sm font-semibold">{rec.title}</div>
                  </div>
                  <div className="grid gap-2.5 text-sm pl-0 sm:pl-1">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-sub">Issue</div>
                      <p className="text-ink/90 mt-0.5">{rec.issue}</p>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-sub">Why it matters</div>
                      <p className="text-sub mt-0.5">{rec.why}</p>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-sub">How to fix</div>
                      <p className="text-ink/90 mt-0.5">{rec.fix}</p>
                    </div>
                    {rec.reference && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-sub">Reference</div>
                        <a
                          href={rec.reference}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand hover:underline break-all text-xs mt-0.5 inline-block"
                        >
                          {rec.reference}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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

      {/* Lead capture at the valuable moment — after they've seen the grade */}
      <div className="card p-5 md:p-6 animate-fade-up">
        <EmailCapture report={report} />
      </div>

      {/* Share + export */}
      <div className="card p-5">
        <h3 className="font-semibold mb-1">Export & share</h3>
        <p className="text-sm text-sub mb-3">No email needed — copy Markdown for issues/PRs or download the raw report.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => copy(md, "md")}>
            {copied === "md" ? "Copied!" : "Copy Markdown"}
          </button>
          <button className="btn-ghost" onClick={() => copy(JSON.stringify(report, null, 2), "json")}>
            {copied === "json" ? "Copied!" : "Export JSON"}
          </button>
          <button
            className="btn-ghost"
            onClick={() => download(`mcp-report-${report.id}.md`, md, "text/markdown")}
          >
            Download Markdown
          </button>
          <button
            className="btn-ghost"
            onClick={() =>
              download(`mcp-report-${report.id}.json`, JSON.stringify(report, null, 2), "application/json")
            }
          >
            Download Report
          </button>
          <button
            className="btn-ghost"
            onClick={savePermalink}
            disabled={saveState === "loading"}
          >
            {saveState === "loading"
              ? "Saving…"
              : copied === "saved"
              ? "Link copied!"
              : saveState === "done"
              ? "Copy saved link again"
              : "Save & copy link"}
          </button>
        </div>
        {saveState === "done" && savedUrl && (
          <p className="mt-3 text-xs text-sub break-all">
            Permalink (30-day TTL):{" "}
            <a href={savedUrl} className="text-brand hover:underline font-mono">
              {savedUrl}
            </a>
          </p>
        )}
        {saveState === "error" && saveNote && (
          <p className="mt-3 text-xs text-warn">{saveNote}</p>
        )}
      </div>

      <ReportUseful reportId={report.id} grade={report.overall.grade} />
    </div>
  );
}
