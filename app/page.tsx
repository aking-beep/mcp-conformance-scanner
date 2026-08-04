"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AccessGate, loadStoredAccess, type AccessProfile } from "@/components/AccessGate";
import { ScanForm, type ScanKind } from "@/components/ScanForm";
import { Report } from "@/components/Report";
import { FeedbackButton } from "@/components/Feedback";
import type { ScanReport } from "@/lib/mcp/types";

const FEATURES = [
  ["Protocol compliance", "Handshake, version, capabilities validated against the MCP spec."],
  ["Tool & schema validation", "Every tool checked for safe names, typed JSON-Schema, and docs."],
  ["Resources & prompts", "URI hygiene and prompt definitions verified when advertised."],
  ["Error handling", "Probes unknown methods and malformed input for graceful JSON-RPC errors."],
  ["Auth / OAuth 2.1", "PRM, AS metadata, PKCE S256, and refresh_token discovery for remote servers."],
  ["Security & injection", "TLS, CORS, prompt-injection surface, and destructive-tool guardrails."],
  ["Streaming support", "Confirms Streamable HTTP (SSE) for progress on long tool calls."],
  ["Model compatibility", "Estimates fit for Claude, OpenAI, Gemini, and Bedrock."],
];

export default function Home() {
  const [access, setAccess] = useState<AccessProfile | null>(null);
  const [gateReady, setGateReady] = useState(false);
  const [gateRequired, setGateRequired] = useState(true);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = loadStoredAccess();
      try {
        const res = await fetch("/api/access", {
          headers: stored?.token ? { authorization: `Bearer ${stored.token}` } : undefined,
        });
        const data = await res.json();
        if (cancelled) return;
        setGateRequired(!!data.required);
        if (!data.required) {
          setAccess(stored ?? { token: "", email: "", firstName: "" });
        } else if (data.unlocked) {
          // Cookie and/or stored token already valid
          setAccess(stored ?? { token: "", email: data.email || "", firstName: "" });
        }
      } catch {
        if (!cancelled && stored) setAccess(stored);
      } finally {
        if (!cancelled) setGateReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function scan(kind: ScanKind, value: string) {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const body =
        kind === "endpoint" ? { kind, url: value } : kind === "github" ? { kind, repo: value } : { kind, image: value };
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(access?.token ? { authorization: `Bearer ${access.token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 401 && data.code === "access_required") {
        setAccess(null);
        throw new Error("Please complete the short signup to continue.");
      }
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setReport(data as ScanReport);
    } catch (e: any) {
      setError(e?.message ?? "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  const unlocked = !gateRequired || access !== null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 md:py-14">
      <header className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg grid place-items-center font-bold text-white" style={{ background: "linear-gradient(135deg,#6b97ff,#7c5cff)" }}>M</div>
          <span className="font-semibold">MCP Conformance Scanner</span>
          <span className="pill text-sub ml-1">by ARC Labs</span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-sub">
          <Link href="/docs" className="hover:text-ink">Docs</Link>
          <Link href="/roadmap" className="hover:text-ink">Roadmap</Link>
          <a href="https://github.com/aking-beep/mcp-conformance-scanner" className="hover:text-ink" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </header>

      <section className="text-center mb-8">
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
          Is your <span style={{ color: "#7c5cff" }}>MCP server</span> ready?
        </h1>
        <p className="mt-3 text-sub max-w-2xl mx-auto">
          Scan any MCP server for protocol compliance, security, and Claude / OpenAI / Gemini / Bedrock
          compatibility. Get a grade, prioritized fixes, and a shareable report — free.
        </p>
      </section>

      {!gateReady && (
        <div className="card p-5 text-sm text-sub">Loading…</div>
      )}

      {gateReady && !unlocked && (
        <AccessGate onUnlocked={setAccess} />
      )}

      {gateReady && unlocked && (
        <>
          {access?.firstName && (
            <p className="text-xs text-sub mb-3">
              Signed in as {access.firstName} ({access.email}). Free scans are rate-limited to protect the service.
            </p>
          )}
          <ScanForm onScan={scan} loading={loading} />
        </>
      )}

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

      {error && !loading && (
        <div className="card p-5 mt-6 border-bad/40">
          <div className="text-bad font-medium">Scan error</div>
          <div className="text-sm text-sub mt-1">{error}</div>
        </div>
      )}

      {report && !loading && (
        <div className="mt-6">
          <Report report={report} />
        </div>
      )}

      {!report && !loading && gateReady && (
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
