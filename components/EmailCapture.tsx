"use client";

import { useState } from "react";
import type { ScanReport } from "@/lib/mcp/types";

export function EmailCapture({ report }: { report: ScanReport }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [note, setNote] = useState("");
  const [url, setUrl] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, reportId: report.id, report }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setState("done");
      setUrl(typeof data.url === "string" ? data.url : null);
      if (data.stored && data.url) {
        setNote(data.emailed
          ? "Saved — check your inbox for the report link."
          : "Report saved. Copy the permalink below (email webhook not configured).");
      } else if (data.emailed) {
        setNote("Thanks — we'll email updates. Report storage isn't configured on this instance.");
      } else {
        setNote(data.note || "Thanks! (Storage isn't configured on this instance.)");
      }
    } catch {
      setState("error");
      setNote("Something went wrong. Try again later.");
    }
  }

  if (state === "done") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-good">{note}</p>
        {url && (
          <p className="text-xs text-sub break-all">
            Permalink:{" "}
            <a href={url} className="text-brand hover:underline font-mono">
              {url}
            </a>
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3">
      <div className="flex-1">
        <label className="text-sm font-medium">
          Save this report & get updates <span className="text-sub font-normal">(optional)</span>
        </label>
        <input
          type="email"
          required
          className="input mt-1.5"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <p className="text-[11px] text-sub mt-1.5">
          Explicit opt-in only. Saved reports expire after 30 days.
        </p>
      </div>
      <button type="submit" className="btn-ghost self-end" disabled={state === "loading"}>
        {state === "loading" ? "…" : "Email me the report"}
      </button>
      {state === "error" && <span className="text-sm text-bad self-end">{note}</span>}
    </form>
  );
}
