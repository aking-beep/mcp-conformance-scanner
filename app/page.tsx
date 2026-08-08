"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AccessGate, loadStoredAccess, type AccessProfile } from "@/components/AccessGate";
import { ScanForm, type ScanKind } from "@/components/ScanForm";
import { Report } from "@/components/Report";
import { FeedbackButton } from "@/components/Feedback";
import type { ScanReport } from "@/lib/mcp/types";
import {
  DEMO_ENDPOINT,
  GITHUB_ISSUES,
  GITHUB_NEW_BUG,
  GITHUB_NEW_RULE,
  SCANNER_UPDATED,
  SCANNER_VERSION_LABEL,
} from "@/lib/version";

const CURRENT_CHECKS = [
  "Authentication & OAuth 2.1 discovery",
  "Tool schema validation",
  "Prompt-injection surface",
  "Configuration & capabilities",
  "Transport / streaming (SSE)",
  "Missing metadata (serverInfo, version)",
  "Best-practice compliance",
  "TLS / CORS / security posture",
  "Error handling & production readiness",
  "Model compatibility (Claude / OpenAI / Gemini / Bedrock)",
];

type PendingScan = { kind: ScanKind; value: string };

export default function Home() {
  const [access, setAccess] = useState<AccessProfile | null>(null);
  const [gateReady, setGateReady] = useState(false);
  const [gateRequired, setGateRequired] = useState(true);
  const [showGate, setShowGate] = useState(false);
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accessRef = useRef<AccessProfile | null>(null);

  useEffect(() => {
    accessRef.current = access;
  }, [access]);

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
        } else if (data.unlocked && stored) {
          setAccess(stored);
        } else if (data.unlocked) {
          setAccess({ token: "", email: data.email || "", firstName: "" });
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

  function resetHome() {
    setReport(null);
    setError(null);
    setLoading(false);
    setShowGate(false);
    setPendingScan(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function runScan(kind: ScanKind, value: string, profile: AccessProfile | null) {
    setLoading(true);
    setError(null);
    setReport(null);
    setShowGate(false);
    try {
      const body =
        kind === "endpoint" ? { kind, url: value } : kind === "github" ? { kind, repo: value } : { kind, image: value };
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(profile?.token ? { authorization: `Bearer ${profile.token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 401 && data.code === "access_required") {
        setAccess(null);
        setPendingScan({ kind, value });
        setShowGate(true);
        setError(null);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setPendingScan(null);
      setReport(data as ScanReport);
    } catch (e: any) {
      setError(e?.message ?? "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  function onScan(kind: ScanKind, value: string) {
    const needsGate = gateRequired && !accessRef.current?.token;
    if (needsGate) {
      setPendingScan({ kind, value });
      setShowGate(true);
      setReport(null);
      setError(null);
      requestAnimationFrame(() => {
        document.getElementById("scan-gate")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }
    void runScan(kind, value, accessRef.current);
  }

  function onUnlocked(profile: AccessProfile) {
    setAccess(profile);
    setShowGate(false);
    const pending = pendingScan;
    if (pending) {
      void runScan(pending.kind, pending.value, profile);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 md:py-14">
      <header className="flex items-center justify-between mb-8 gap-3">
        <button
          type="button"
          onClick={resetHome}
          className="flex items-center gap-2.5 min-w-0 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          aria-label="MCP Conformance Scanner — back to start"
        >
          <div
            className="h-8 w-8 rounded-lg grid place-items-center font-bold text-white shrink-0"
            style={{ background: "linear-gradient(135deg,#6b97ff,#7c5cff)" }}
          >
            M
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate">MCP Conformance Scanner</div>
            <div className="text-[11px] text-sub">
              {SCANNER_VERSION_LABEL} · Updated {SCANNER_UPDATED}
            </div>
          </div>
        </button>
        <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm text-sub shrink-0">
          <Link href="/docs" className="hover:text-ink">Docs</Link>
          <Link href="/changelog" className="hover:text-ink">Changelog</Link>
          <Link href="/roadmap" className="hover:text-ink">Roadmap</Link>
          <a href={GITHUB_ISSUES} className="hover:text-ink" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </header>

      <section className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="pill">Free · Open Source · Community Project</span>
          <span className="pill">Built by ARC Labs</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight max-w-3xl">
          Scan your MCP server for production readiness in under 30 seconds.
        </h1>
        <ul className="mt-4 space-y-1.5 text-sm md:text-base text-ink/90">
          <li>✅ Security checks</li>
          <li>✅ Configuration validation</li>
          <li>✅ Best practice recommendations</li>
        </ul>
        <p className="mt-3 text-sm text-sub">
          Average scan: ~15–30 seconds · Free forever for basic scans
        </p>
      </section>

      {!gateReady && (
        <div className="card p-5 text-sm text-sub">Loading…</div>
      )}

      {gateReady && (
        <>
          {access?.firstName && access.token && (
            <p className="text-xs text-sub mb-3">
              Signed in as {access.firstName} ({access.email}). Free scans are rate-limited to protect the service.
            </p>
          )}
          <ScanForm
            onScan={onScan}
            loading={loading || showGate}
            onDemo={() => onScan("endpoint", DEMO_ENDPOINT)}
          />
        </>
      )}

      {showGate && gateReady && (
        <div id="scan-gate" className="mt-6">
          <AccessGate onUnlocked={onUnlocked} />
        </div>
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
          <p className="text-sm text-sub mt-4">
            Running the MCP handshake and 20+ conformance checks… usually 15–30 seconds.
          </p>
        </div>
      )}

      {error && !loading && !showGate && (
        <div className="card p-5 mt-6 border-bad/40">
          <div className="text-bad font-medium">Scan error</div>
          <div className="text-sm text-sub mt-1">{error}</div>
        </div>
      )}

      {report && !loading && !showGate && (
        <div className="mt-6">
          <Report report={report} />
        </div>
      )}

      {!report && !loading && !showGate && gateReady && (
        <div className="mt-10 space-y-6">
          <section className="card p-5">
            <h2 className="font-semibold mb-1">Current checks</h2>
            <p className="text-sm text-sub mb-4">What this scanner actually evaluates today.</p>
            <ul className="grid sm:grid-cols-2 gap-2 text-sm text-ink/90">
              {CURRENT_CHECKS.map((c) => (
                <li key={c} className="flex gap-2">
                  <span className="text-good shrink-0">•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-5">
            <h2 className="font-semibold mb-1">Privacy & data</h2>
            <p className="text-sm text-sub leading-relaxed">
              We do not permanently store your MCP server configuration or scan results by default.
              The scanner analyzes your target, returns the report, and discards the scan unless you
              explicitly save a permalink or email yourself the report. Signup details (when you unlock
              a report) are kept so ARC Labs can follow up — not sold.
            </p>
          </section>

          <section className="flex flex-wrap gap-2">
            <a href={GITHUB_NEW_BUG} target="_blank" rel="noreferrer" className="btn-ghost text-sm">
              Report a Bug
            </a>
            <a href={GITHUB_NEW_RULE} target="_blank" rel="noreferrer" className="btn-ghost text-sm">
              Suggest a Rule
            </a>
            <Link href="/changelog" className="btn-ghost text-sm">
              Changelog
            </Link>
            <Link href="/roadmap" className="btn-ghost text-sm">
              Roadmap
            </Link>
          </section>
        </div>
      )}

      <footer className="mt-16 pt-8 border-t border-line text-sm text-sub space-y-3">
        <p>
          <span className="text-ink/80 font-medium">Built by ARC Labs</span>
          {" — "}
          free tools for AI engineers. {SCANNER_VERSION_LABEL} · Updated {SCANNER_UPDATED}.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} ARC Labs · MIT · Community project</span>
          <div className="flex flex-wrap gap-4">
            <Link href="/docs" className="hover:text-ink">API docs</Link>
            <Link href="/changelog" className="hover:text-ink">Changelog</Link>
            <Link href="/roadmap" className="hover:text-ink">Roadmap</Link>
            <a href={GITHUB_NEW_BUG} className="hover:text-ink" target="_blank" rel="noreferrer">Report a Bug</a>
          </div>
        </div>
      </footer>

      <FeedbackButton />
    </main>
  );
}
