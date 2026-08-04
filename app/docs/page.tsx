import Link from "next/link";

export const metadata = { title: "Docs — MCP Conformance Scanner" };

function Code({ children }: { children: string }) {
  return (
    <pre className="card p-4 overflow-x-auto text-sm font-mono text-ink/90 whitespace-pre">
      {children}
    </pre>
  );
}

export default function Docs() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:py-14 space-y-8">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-sub hover:text-ink">← Back to scanner</Link>
        <a href="https://github.com/aking-beep/mcp-conformance-scanner" className="text-sm text-sub hover:text-ink" target="_blank" rel="noreferrer">GitHub</a>
      </header>

      <div>
        <h1 className="text-3xl font-bold">Documentation</h1>
        <p className="text-sub mt-2">Everything the scanner checks, and how to run it yourself.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">API</h2>
        <p className="text-sub text-sm">One endpoint. POST a target, get a full JSON report back.</p>
        <Code>{`POST /api/scan
Content-Type: application/json

{
  "kind": "endpoint",
  "url": "https://your-server.com/mcp",
  "headers": { "Authorization": "Bearer <token>" }   // optional
}

// or static GitHub analysis:
{ "kind": "github", "repo": "owner/repo" }

// or Docker / OCI image metadata:
{ "kind": "docker", "image": "ghcr.io/org/mcp-server:latest" }`}</Code>
        <p className="text-sub text-sm">Example with curl:</p>
        <Code>{`curl -s https://your-instance.vercel.app/api/scan \\
  -H 'content-type: application/json' \\
  -d '{"kind":"endpoint","url":"https://mcp.deepwiki.com/mcp"}' | jq .overall`}</Code>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Conformance badge</h2>
        <p className="text-sub text-sm">
          Embed a live SVG badge in your README. Caches for 5 minutes.
        </p>
        <Code>{`![MCP conformance](https://your-instance.vercel.app/api/badge?url=https://your-server/mcp)
![MCP conformance](https://your-instance.vercel.app/api/badge?repo=owner/repo)
![MCP conformance](https://your-instance.vercel.app/api/badge?image=ghcr.io/org/mcp:latest)`}</Code>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Local CLI</h2>
        <Code>{`npm install
npm run scan -- https://your-server.com/mcp`}</Code>
        <p className="text-sub text-sm">Exits non-zero when the overall grade is D or F — handy in CI.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What we score</h2>
        <ul className="text-sm text-sub space-y-2 list-disc pl-5">
          <li><b className="text-ink">Protocol compliance (22%)</b> — reachability, version, serverInfo, capabilities.</li>
          <li><b className="text-ink">Tools (18%)</b> — naming, JSON-Schema inputs, descriptions.</li>
          <li><b className="text-ink">Error handling (12%)</b> — unknown-method (-32601) and malformed-input behavior.</li>
          <li><b className="text-ink">Authentication (12%)</b> — enforcement and OAuth/bearer discovery.</li>
          <li><b className="text-ink">Security (14%)</b> — TLS, CORS, injection surface, destructive-tool guardrails.</li>
          <li><b className="text-ink">Resources / Prompts (6% each)</b> — URI hygiene and prompt validity when advertised.</li>
          <li><b className="text-ink">Streaming (6%)</b> — Streamable HTTP / SSE support.</li>
          <li><b className="text-ink">Documentation (4%)</b> — inline tool docs and server self-identification.</li>
        </ul>
        <p className="text-sub text-sm">
          Skipped categories (e.g. a server with no prompts) are excluded from the weighted average, so you're
          never penalized for a capability you don't offer.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Privacy</h2>
        <p className="text-sub text-sm">
          Scans run server-side from your deployment and are not persisted. Email capture is entirely optional and
          disabled unless you configure <code className="font-mono">EMAIL_CAPTURE_WEBHOOK_URL</code>. Basic scanning is always free.
        </p>
      </section>
    </main>
  );
}
