"use client";

import { useState } from "react";
import type { ScanReport } from "@/lib/mcp/types";

export function EmailCapture({ report }: { report: ScanReport }) {
  const [email, setEmail] = useState("");
  const [updates, setUpdates] = useState(true);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [note, setNote] = useState("");
  const [url, setUrl] = useState<string | null>(null);

  const grade = report.overall.grade;
  const score = report.overall.score;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          reportId: report.id,
          report,
          updates,
          source: "report_capture",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setState("done");
      setUrl(typeof data.url === "string" ? data.url : null);
      if (data.stored && data.url) {
        setNote(
          data.emailed
            ? "Saved — check your inbox for the report link."
            : "Report saved. Copy the permalink below (email delivery isn’t configured on this host).",
        );
      } else if (data.emailed) {
        setNote("Thanks — we’ll be in touch. Permalink storage isn’t configured on this instance.");
      } else {
        setNote(data.note || "Thanks! We’ll keep you posted.");
      }
    } catch {
      setState("error");
      setNote("Something went wrong. Try again, or use Copy Markdown / Download above.");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-xl border border-good/30 bg-good/5 p-4 space-y-2">
        <p className="text-sm font-medium text-good">{note}</p>
        {url && (
          <p className="text-xs text-sub break-all">
            Shareable link (30 days):{" "}
            <a href={url} className="text-brand hover:underline font-mono">
              {url}
            </a>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-brand/25 bg-brand/5 p-4 md:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
        <div>
          <h3 className="font-semibold text-ink">Save your {grade} ({score}/100)</h3>
          <p className="text-sm text-sub mt-1 max-w-xl">
            Email yourself a shareable link to this report — handy for GitHub issues, PRs, and
            fixing the list below. Optional. No password.
          </p>
        </div>
        <span className="pill shrink-0 self-start">Optional</span>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            required
            className="input flex-1"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <button type="submit" className="btn-primary shrink-0" disabled={state === "loading"}>
            {state === "loading" ? "Saving…" : "Email me the report"}
          </button>
        </div>

        <label className="flex items-start gap-2.5 text-sm text-sub cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={updates}
            onChange={(e) => setUpdates(e.target.checked)}
          />
          <span>Also notify me about ARC Labs updates (and when we ship better grade tracking)</span>
        </label>

        {state === "error" && <p className="text-sm text-bad">{note}</p>}
        <p className="text-[11px] text-sub">
          Explicit opt-in. We only use this for your report link and the updates you choose.
        </p>
      </form>
    </div>
  );
}
