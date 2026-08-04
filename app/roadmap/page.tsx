import Link from "next/link";

export const metadata = { title: "Roadmap — MCP Conformance Scanner" };

const COLUMNS: { title: string; tone: string; items: string[] }[] = [
  {
    title: "Shipped",
    tone: "#35d0a5",
    items: [
      "MCP endpoint scanning (Streamable HTTP)",
      "Version, capabilities & handshake validation",
      "Tool / resource / prompt validation",
      "Error-handling & auth probes",
      "Security + prompt-injection surface checks",
      "Multi-model compatibility matrix",
      "Grade, recommendations & shareable JSON report",
      "Public API + local CLI",
      "GitHub repository static scanning",
      "Docker / OCI image metadata scanning",
      "Conformance badge (SVG) for READMEs",
    ],
  },
  {
    title: "In progress",
    tone: "#f0b23a",
    items: [
      "GitHub Action for CI conformance gating",
      "Deeper OAuth 2.1 flow validation",
      "Saved reports via optional email capture",
    ],
  },
  {
    title: "Planned",
    tone: "#5b8cff",
    items: [
      "Historical scans & regression tracking",
      "Community-submitted check rules",
      "Public leaderboard of conformant servers",
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
        <h1 className="text-3xl font-bold">Public roadmap</h1>
        <p className="text-sub mt-2">Built in the open. Vote and suggest via the feedback button or GitHub issues.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => (
          <div key={col.title} className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: col.tone }} />
              <h2 className="font-semibold">{col.title}</h2>
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
