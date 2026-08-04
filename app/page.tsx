"use client";

import { useState } from "react";
import Link from "next/link";
import { ScanForm, type ScanKind } from "@/components/ScanForm";
import { Report } from "@/components/Report";
import { FeedbackButton } from "@/components/Feedback";
import type { ScanReport } from "@/lib/mcp/types";

const FEATURES = [
  ["Protocol compliance", "Handshake, version, capabilities validated against the MCP spec."],
  ["Tool & schema validation", "Every tool checked for safe names, typed JSON-Schema, and docs."],
  ["Resources & prompts", "URI hygiene and prompt definitions verified when advertised."],
  ["Error handling", "Probes unknown methods and malformed input for graceful JSON-RPC errors."],
  ["Auth review", "Detects OAuth/bearer enforcement and flags unauthenticated write surfaces."],
  ["Security & injection", "TLS, CORS, prompt-injection surface, and destructive-tool guardrails."],
  ["Streaming support", "Confirms Streamable HTTP (SSE) for progress on long tool calls."],
  ["Model compatibility", "Estimates fit for Claude, OpenAI, Gemini, and Bedrock."],
];

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function scan(kind: ScanKind, value: string) {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const body =
        kind === "endpoint" ? { kind, url: value } : kind === "github" ? { kind, repo: value } : { kind, image: value };
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setReport(data as ScanReport);
    } catch (e: any) {
      setError(e?.message ?? "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 md:py-14">
      {/* Nav */}
      <header className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg grid place-items-center font-bold text-white" style={{ background: "linear-gradient(135deg,#6b97ff,#7c5cff)" }}>M</div>
          <span className="font-semibold">MCP Conformance Scanner</span>
          <span className="pill text-sub ml-1">by ARC Labs</span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-sub">
          <Link href="/docs" className="hover:text-ink">Docs</Link>
          <Link href="/roadmap" className="hover:text-ink">Roadmap</Link>
          <a href="https://github.com/arc-labs/mcp-conformance-scanner" className="hover:text-ink" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </header>

      {/* Hero */}
      <section className="text-center mb-8">
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
          Is your <span style={{ color: "#7c5cff" }}>MCP server</span> ready?
        </h1>
        <p className="mt-3 text-sub max-w-2xl mx-auto">
          Scan any MCP server for protocol compliance, security, and Claude / OpenAI / Gemini / Bedrock
          compatibility. Get a grade, prioritized fixes, and a shareable report — free.
        </p>
      </section>

      {/* Scan form */}
      <ScanForm onScan={scan} loading={loading} />

      {/* Loading skeleton */}
      {loading && (
        <div className="card p-6 mt-6 overflow-hidden">
          <div className="relative">
            <div className="h-6 w-40 bg-panel2 rounded" />
            <div className="mt-4 space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-4 bg-panel2 rounded" style={{ width: `${90 - i * 12}%` }} />)}
            </div>
            <div className="absolute inset-0 animate-sweep" style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,.06),transparent)" }} />
          </div>
          <p className="text-sm text-sub mt-4">Running the MCP handshake and 20+ conformance checks…</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="card p-5 mt-6 border-bad/40">
          <div className="text-bad font-medium">Scan error</div>
          <div className="text-sm text-sub mt-1">{error}</div>
        </div>
      )}

      {/* Report */}
      {report && !loading && (
        <div className="mt-6">
          <Report report={report} />
        </div>
      )}

      {/* Features */}
      {!report && !loading && (
        <section className="mt-12">
          <h2 className="text-sm uppercase tracking-wide text-sub mb-4">What we check</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {FEATURES.map(([title, desc]) => (
              <div key={title} className="card p-4">
                <div className="font-medium">{title}</div>
                <div className="text-sm text-sub mt-1">{desc}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-16 pt-8 border-t border-line text-sm text-sub flex flex-wrap items-center justify-between gap-3">
        <span>© {new Date().getFullYear()} ARC Labs · MIT licensed · Free forever for basic scans</span>
        <div className="flex gap-4">
          <Link href="/docs" className="hover:text-ink">API docs</Link>
          <Link href="/roadmap" className="hover:text-ink">Public roadmap</Link>
        </div>
      </footer>

      <FeedbackButton />
    </main>
  );
}
