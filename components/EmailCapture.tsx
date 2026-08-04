"use client";

import { useState } from "react";

export function EmailCapture({ reportId }: { reportId?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [note, setNote] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, reportId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setState("done");
      setNote(data.stored ? "Saved — we'll email your report and product updates." : "Thanks! (Storage isn't configured on this instance.)");
    } catch {
      setState("error");
      setNote("Something went wrong. Try again later.");
    }
  }

  if (state === "done") {
    return <p className="text-sm text-good">{note}</p>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3">
      <div className="flex-1">
        <label className="text-sm font-medium">Save this report & get updates <span className="text-sub font-normal">(optional)</span></label>
        <input
          type="email"
          required
          className="input mt-1.5"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <button type="submit" className="btn-ghost self-end" disabled={state === "loading"}>
        {state === "loading" ? "…" : "Email me the report"}
      </button>
      {state === "error" && <span className="text-sm text-bad self-end">{note}</span>}
    </form>
  );
}
