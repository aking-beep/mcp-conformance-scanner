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

## Conformance badge

```markdown
![MCP conformance](https://your-instance.vercel.app/api/badge?url=https://your-server/mcp)
![MCP conformance](https://your-instance.vercel.app/api/badge?repo=owner/repo)
```

## Roadmap

Docker image inspection and a GitHub Action for CI gating are next. GitHub repo scanning and the
conformance badge ship in v0.2. See **/roadmap**.

## License

MIT.
