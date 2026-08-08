"use client";

import { useState } from "react";
import { GITHUB_NEW_RULE } from "@/lib/version";

export function ReportUseful({ reportId, grade }: { reportId: string; grade: string }) {
  const [vote, setVote] = useState<"yes" | "no" | null>(null);
  const [ruleIdea, setRuleIdea] = useState("");
  const [sentIdea, setSentIdea] = useState(false);

  async function send(useful: "yes" | "no") {
    setVote(useful);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: `Report useful: ${useful} (grade ${grade}, id ${reportId})`,
          context: "report_useful",
        }),
      });
    } catch {
      /* best-effort */
    }
  }

  async function submitIdea(e: React.FormEvent) {
    e.preventDefault();
    if (!ruleIdea.trim()) return;
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: `Suggested rule: ${ruleIdea.trim()}`,
          context: "suggest_rule",
        }),
      });
    } catch {
      /* best-effort */
    }
    setSentIdea(true);
  }

  return (
    <div className="card p-5">
      <h3 className="font-semibold">Was this report useful?</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn-ghost ${vote === "yes" ? "border-good text-good" : ""}`}
          onClick={() => send("yes")}
          disabled={vote !== null}
        >
          👍 Yes
        </button>
        <button
          type="button"
          className={`btn-ghost ${vote === "no" ? "border-bad text-bad" : ""}`}
          onClick={() => send("no")}
          disabled={vote !== null}
        >
          👎 No
        </button>
        {vote && <span className="text-sm text-sub self-center ml-1">Thanks — that helps ARC Labs improve.</span>}
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <p className="text-sm text-sub mb-2">What rule should we add next?</p>
        {sentIdea ? (
          <p className="text-sm text-good">Got it — thank you.</p>
        ) : (
          <form onSubmit={submitIdea} className="flex flex-col sm:flex-row gap-2">
            <input
              className="input flex-1"
              placeholder="e.g. validate resource MIME types"
              value={ruleIdea}
              onChange={(e) => setRuleIdea(e.target.value)}
            />
            <button type="submit" className="btn-ghost shrink-0" disabled={!ruleIdea.trim()}>
              Suggest
            </button>
          </form>
        )}
        <a
          href={GITHUB_NEW_RULE}
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-3 text-xs text-brand hover:underline"
        >
          Or open a GitHub issue →
        </a>
      </div>
    </div>
  );
}
