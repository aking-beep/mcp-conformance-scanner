import Link from "next/link";
import { SCANNER_UPDATED, SCANNER_VERSION_LABEL } from "@/lib/version";

export const metadata = { title: "Changelog — MCP Conformance Scanner" };

const ENTRIES = [
  {
    version: "v0.9 Beta",
    date: "August 2026",
    items: [
      "+ Launch trust UX (value prop, privacy, version, current checks)",
      "+ Severity summary + production-ready signal",
      "+ Demo server + report usefulness feedback",
      "+ Custom domain for ARC Labs",
    ],
  },
  {
    version: "v0.1 → Release #1",
    date: "2026",
    items: [
      "+ Endpoint / GitHub / Docker scanning",
      "+ OAuth 2.1, security, schema, and transport checks",
      "+ Markdown / JSON export, badge, GitHub Action, CLI",
      "+ Actionable recommendations with spec references",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:py-14 space-y-8">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-sub hover:text-ink">← Back to scanner</Link>
        <span className="pill text-sub">{SCANNER_VERSION_LABEL} · {SCANNER_UPDATED}</span>
      </header>
      <div>
        <h1 className="text-3xl font-bold">Changelog</h1>
        <p className="text-sub mt-2">What changed recently — kept short on purpose.</p>
      </div>
      <div className="space-y-6">
        {ENTRIES.map((e) => (
          <div key={e.version} className="card p-5">
            <div className="flex flex-wrap items-baseline gap-2 mb-3">
              <h2 className="font-semibold">{e.version}</h2>
              <span className="text-xs text-sub">{e.date}</span>
            </div>
            <ul className="space-y-1.5 text-sm text-sub font-mono">
              {e.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </main>
  );
}
