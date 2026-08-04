# MCP Conformance Scanner

Free developer tool that scans any **Model Context Protocol (MCP)** server and grades it on
protocol compliance, security, and multi-model compatibility (Claude / OpenAI / Gemini / Bedrock).
Built by **ARC Labs**.

- **Modern web UI** — paste an endpoint, get a grade, gauges, and prioritized fixes.
- **Public API** — `POST /api/scan`.
- **Local CLI** — `npm run scan -- <url>` (exits non-zero below a C grade, so it drops into CI).
- **Shareable report** — copy/download the full JSON.
- **Free forever** for basic scans. Optional email capture is off by default.

---

## Quick start (Cursor)

```bash
# 1. Open this folder in Cursor
# 2. Install deps
npm install

# 3. Run the dev server
npm run dev
# → http://localhost:3000

# 4. (optional) scan from the terminal
npm run scan -- https://mcp.deepwiki.com/mcp
```

No environment variables are required for scanning. Copy `.env.example` to `.env.local` only if you
want the optional feedback webhook or email capture.

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. In Vercel: **New Project → import the repo → Deploy**. Framework auto-detects as Next.js.
3. (Optional) add env vars from `.env.example` in Project Settings.

That's it — the scan runs server-side in a Node serverless function (`app/api/scan/route.ts`,
30s max duration configured in `vercel.json`).

## Project layout

```
app/
  page.tsx              # landing + scanner UI (client)
  docs/ roadmap/        # documentation & public roadmap pages
  api/scan/route.ts     # main scan endpoint
  api/feedback/route.ts # feedback button target
  api/subscribe/route.ts# optional email capture
lib/mcp/
  client.ts             # MCP Streamable-HTTP JSON-RPC client + probes
  checks.ts             # 20+ conformance checks
  scoring.ts            # category rollups, grades, derived scores
  compatibility.ts      # Claude/OpenAI/Gemini/Bedrock estimation
  scan.ts               # orchestrator → ScanReport
  types.ts              # shared types
components/             # UI (form, report, gauges, feedback, email capture)
cli/scan.ts             # local CLI
```

## How scoring works

Each check returns pass / warn / fail (or skip). Checks roll up into weighted categories; the
overall grade re-normalizes weights over categories that actually apply, so a server without
prompts isn't penalized for not having them. See **/docs** for the full weighting table.

## How the endpoint probe works

The scanner performs a real MCP handshake: `initialize` → `notifications/initialized` →
`tools/list` / `resources/list` / `prompts/list`, then deliberately sends an unknown method and a
malformed body to observe error handling. It parses both `application/json` and `text/event-stream`
(SSE) responses and carries the `Mcp-Session-Id` header across calls.

## GitHub Action (CI gating)

```yaml
- uses: aking-beep/mcp-conformance-scanner@main
  with:
    target: https://your-server.com/mcp
    min-grade: B
```

Also supports `kind: github|docker|endpoint|auto`, writes `mcp-report.json`, and exposes
`grade` / `score` / `reachable` outputs. CLI equivalent:

```bash
npm run scan -- --min-grade=B --report report.json https://your-server.com/mcp
```

## Conformance badge

```markdown
![MCP conformance](https://your-instance.vercel.app/api/badge?url=https://your-server/mcp)
![MCP conformance](https://your-instance.vercel.app/api/badge?repo=owner/repo)
```

## Saved reports

Explicit opt-in only (never auto-stored). In development, reports persist under `.data/reports`.
In production, set Upstash Redis REST credentials (or `REPORT_STORE_DIR`).

```bash
# Save
curl -s localhost:3000/api/reports -H 'content-type: application/json' \
  -d '{"report":{...}}' 
# → { "id":"rpt_…", "url":"http://localhost:3000/r/rpt_…" }

# Load
curl -s localhost:3000/api/reports/rpt_…
```

Email capture posts the full report + address to `/api/subscribe`, saves when a store is
configured, and optionally notifies `EMAIL_CAPTURE_WEBHOOK_URL` with the permalink.

## Roadmap

Historical scans, community check rules, and a public leaderboard are next. See **/roadmap**.

## License

MIT.
