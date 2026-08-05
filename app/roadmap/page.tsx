import Link from "next/link";

export const metadata = { title: "Roadmap — MCP Conformance Scanner" };

const COLUMNS: { title: string; tone: string; items: string[] }[] = [
  {
    title: "Shipped — ARC Labs 0.1",
    tone: "#35d0a5",
    items: [
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
    ],
  },
  {
    title: "Coming soon — ARC Labs",
    tone: "#7c5cff",
    items: [
      "Prompt Reviewer",
      "Prompt Injection Scanner",
      "AI Security Scanner",
      "Architecture Generator",
    ],
  },
  {
    title: "Intentionally not building",
    tone: "#8b93a7",
    items: [
      "User accounts / teams",
      "Billing or paywalls",
      "Dashboards & product analytics",
      "AI chat over reports",
      "Complex multi-page report builders",
    ],
  },
];

export default function Roadmap() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 md:py-14 space-y-8">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-sub hover:text-ink">← Back to scanner</Link>
        <a href="https://github.com/aking-beep/mcp-conformance-scanner/issues" className="text-sm text-sub hover:text-ink" target="_blank" rel="noreferrer">Request a feature</a>
      </header>

      <div>
        <p className="text-xs uppercase tracking-wide text-sub mb-2">ARC Labs Release #1</p>
        <h1 className="text-3xl font-bold">Public roadmap</h1>
        <p className="text-sub mt-2 max-w-2xl">
          This scanner is frozen as a focused Labs utility. Sister tools below are next —
          not more platform features on this repo.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => (
          <div key={col.title} className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: col.tone }} />
              <h2 className="font-semibold text-sm leading-snug">{col.title}</h2>
            </div>
            <ul className="space-y-2 text-sm text-sub">
              {col.items.map((i) => <li key={i} className="leading-snug">{i}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </main>
  );
}
