"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Report } from "@/components/Report";
import type { ScanReport } from "@/lib/mcp/types";

export default function SavedReportPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const [report, setReport] = useState<ScanReport | null>(null);
  const [meta, setMeta] = useState<{ createdAt?: string; expiresAt?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/reports/${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Not found");
        if (!cancelled) {
          setReport(data.report as ScanReport);
          setMeta({ createdAt: data.createdAt, expiresAt: data.expiresAt });
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Could not load report");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 md:py-14">
      <header className="flex items-center justify-between mb-8">
        <Link href="/" className="text-sm text-sub hover:text-ink">
          ← New scan
        </Link>
        <span className="pill text-sub">Saved report</span>
      </header>

      {loading && (
        <div className="card p-6">
          <div className="h-6 w-40 bg-panel2 rounded" />
          <div className="mt-4 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-4 bg-panel2 rounded" style={{ width: `${90 - i * 14}%` }} />
            ))}
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="card p-6 border-bad/40">
          <div className="font-semibold text-bad">Report unavailable</div>
          <p className="text-sm text-sub mt-1">{error}</p>
          <p className="text-xs text-sub mt-3">Saved reports expire after 30 days.</p>
          <Link href="/" className="btn-primary inline-flex mt-5">
            Run a new scan
          </Link>
        </div>
      )}

      {report && !loading && (
        <>
          <div className="mb-4 text-xs text-sub">
            Saved {meta.createdAt ? new Date(meta.createdAt).toLocaleString() : ""}
            {meta.expiresAt ? ` · expires ${new Date(meta.expiresAt).toLocaleDateString()}` : ""}
            {" · "}
            <span className="font-mono">{id}</span>
          </div>
          <Report report={report} />
        </>
      )}
    </main>
  );
}
