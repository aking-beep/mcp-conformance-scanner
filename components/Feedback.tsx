"use client";

import { useState } from "react";
import { GITHUB_NEW_BUG, GITHUB_NEW_RULE } from "@/lib/version";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: msg, email: email || undefined, context: "web" }),
      });
    } catch {
      /* best-effort */
    }
    setSent(true);
    setTimeout(() => {
      setOpen(false);
      setSent(false);
      setMsg("");
      setEmail("");
    }, 1400);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 btn-primary shadow-glow"
        aria-label="Send feedback"
      >
        Feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="card p-5 w-full max-w-md animate-fade-up" onClick={(e) => e.stopPropagation()}>
            {sent ? (
              <p className="text-good font-medium py-6 text-center">Thanks for the feedback!</p>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <h3 className="font-semibold">Send feedback</h3>
                <p className="text-sm text-sub">Found a bug or want a check added? Tell us.</p>
                <div className="flex flex-wrap gap-2">
                  <a href={GITHUB_NEW_BUG} target="_blank" rel="noreferrer" className="btn-ghost text-xs py-1.5">
                    Report a Bug
                  </a>
                  <a href={GITHUB_NEW_RULE} target="_blank" rel="noreferrer" className="btn-ghost text-xs py-1.5">
                    Suggest a Rule
                  </a>
                </div>
                <textarea
                  required
                  className="input min-h-[110px]"
                  placeholder="What's on your mind?"
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                />
                <input
                  type="email"
                  className="input"
                  placeholder="Email (optional, for a reply)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
                  <button type="submit" className="btn-primary">Send</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
