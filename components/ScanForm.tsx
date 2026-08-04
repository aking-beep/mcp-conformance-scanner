"use client";

import { useState } from "react";

export type ScanKind = "endpoint" | "github" | "docker";

const TABS: { kind: ScanKind; label: string; placeholder: string; hint: string; ready: boolean }[] = [
  {
    kind: "endpoint",
    label: "MCP server endpoint",
    placeholder: "https://your-server.com/mcp",
    hint: "The live Streamable-HTTP URL your server exposes. Fully supported.",
    ready: true,
  },
  {
    kind: "github",
    label: "GitHub repository",
    placeholder: "owner/repo or https://github.com/owner/repo",
    hint: "Static scan via the GitHub API — SDK, tools, transport, docs, and secrets hygiene. Follow up with an endpoint scan for live probes.",
    ready: true,
  },
  {
    kind: "docker",
    label: "Docker image",
    placeholder: "ghcr.io/org/mcp-server:latest",
    hint: "Pull & inspect a containerized MCP server. On the roadmap.",
    ready: false,
  },
];

export function ScanForm({
  onScan,
  loading,
}: {
  onScan: (kind: ScanKind, value: string) => void;
  loading: boolean;
}) {
  const [kind, setKind] = useState<ScanKind>("endpoint");
  const [value, setValue] = useState("");
  const tab = TABS.find((t) => t.kind === kind)!;

  return (
    <div className="card p-5 md:p-6">
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.kind}
            onClick={() => setKind(t.kind)}
            className={`px-3.5 py-2 rounded-xl text-sm font-medium transition border ${
              kind === t.kind
                ? "border-brand text-white bg-brand/15"
                : "border-line text-sub hover:text-ink hover:bg-panel2"
            }`}
          >
            {t.label}
            {!t.ready && (
              <span className="ml-2 text-[10px] uppercase tracking-wide text-warn">soon</span>
            )}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onScan(kind, value.trim());
        }}
        className="flex flex-col md:flex-row gap-3"
      >
        <input
          className="input font-mono"
          placeholder={tab.placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit" className="btn-primary min-w-[140px]" disabled={loading || !value.trim()}>
          {loading ? "Scanning…" : "Scan"}
        </button>
      </form>

      <p className="mt-3 text-xs text-sub">{tab.hint}</p>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-sub">
        <span className="text-sub/70">Try:</span>
        {kind === "github"
          ? [
              "modelcontextprotocol/servers",
              "https://github.com/modelcontextprotocol/typescript-sdk",
            ].map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setKind("github");
                  setValue(ex);
                }}
                className="pill hover:border-brand hover:text-ink font-mono"
              >
                {ex}
              </button>
            ))
          : [
              "https://mcp.deepwiki.com/mcp",
              "https://server.smithery.ai/mcp",
            ].map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setKind("endpoint");
                  setValue(ex);
                }}
                className="pill hover:border-brand hover:text-ink font-mono"
              >
                {ex}
              </button>
            ))}
      </div>
    </div>
  );
}
