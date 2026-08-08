import Link from "next/link";

export const metadata = { title: "Roadmap — MCP Conformance Scanner" };

const SHIPPED = [
  "MCP endpoint scanning (Streamable HTTP)",
  "Version, capabilities & handshake validation",
  "Tool / resource / prompt validation",
  "Error-handling & auth probes",
  "Security + prompt-injection surface checks",
  "Multi-model compatibility matrix",
  "Overall score + letter grade",
  "Actionable recommendations (issue / why / fix / reference)",
  "Export Markdown + JSON · shareable permalink",
  "Conformance badge (SVG) for READMEs",
  "GitHub Action for CI grade gating",
  "GitHub + Docker static scanning",
  "OAuth 2.1 PRM / AS metadata / PKCE / refresh checks",
];

export default function Roadmap() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 md:py-14 space-y-8">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-sub hover:text-ink">← Back to scanner</Link>
        <a href="https://github.com/aking-beep/mcp-conformance-scanner/issues" className="text-sm text-sub hover:text-ink" target="_blank" rel="noreferrer">Request a feature</a>
      </header>

      <div>
        <p className="text-xs uppercase tracking-wide text-sub mb-2">ARC Labs · 0.9 Beta</p>
        <h1 className="text-3xl font-bold">Public roadmap</h1>
        <p className="text-sub mt-2 max-w-2xl">
          What’s shipped in the MCP Conformance Scanner. Suggest improvements via feedback or GitHub issues.
        </p>
      </div>

      <div className="card p-5 max-w-2xl">
        <div className="flex items-center gap-2 mb-3">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#35d0a5" }} />
          <h2 className="font-semibold text-sm leading-snug">Shipped</h2>
        </div>
        <ul className="space-y-2 text-sm text-sub">
          {SHIPPED.map((i) => (
            <li key={i} className="leading-snug">{i}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}
