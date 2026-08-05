# MCP Conformance Scanner

**ARC Labs 0.1 · Release #1** — Free · Open Source · Community Project

Free developer tool that answers one question: **is my MCP implementation conformant?**

Scan any [Model Context Protocol](https://modelcontextprotocol.io) server and get an overall
score (0–100), letter grade, security gauges, model compatibility, and **actionable** fixes
you can paste into a GitHub issue.

Live: https://arctransformationgrouplab.dev

```markdown
![MCP conformance](https://arctransformationgrouplab.dev/api/badge?grade=A&score=93)
```

---

## What it does

- Handshake + protocol / tools / resources / prompts checks
- Auth + OAuth 2.1 discovery (PRM, PKCE S256, refresh)
- Security surface (TLS, CORS, injection, destructive tools)
- Claude / OpenAI / Gemini / Bedrock compatibility estimate
- Recommendations shaped as **Issue → Why → Fix → Reference**
- Export **Markdown** / **JSON**, download, or save a 30-day permalink
- GitHub Action + CLI for CI gating; SVG badge for READMEs

No accounts. No billing. No dashboards. Intentionally small.

---

## Quick start

```bash
npm install
npm run dev
# → http://localhost:3000

# CLI
npm run scan -- https://mcp.deepwiki.com/mcp
npm run scan -- --min-grade=B --report report.json https://your-server/mcp
```

Optional: copy `.env.example` → `.env.local` for Airtable leads, report storage, or webhooks.

### Deploy to Vercel

Import the GitHub repo → Deploy. Optional env vars are documented in `.env.example`.

---

## Example report

After a scan you’ll see something like:

| Overall | Grade |
|--------:|:-----:|
| **93 / 100** | **A** |

Each failing or warning check becomes a recommendation:

```text
Issue
  Tool getWeather is missing an input schema.

Why it matters
  Clients may not be able to validate requests correctly.

Suggested fix
  Add a JSON Schema describing the expected input parameters.

Reference
  https://modelcontextprotocol.io/specification/.../server/tools
```

Copy Markdown from the report footer to paste into issues or PRs.

---

## Conformance badge

```markdown
![MCP conformance](https://arctransformationgrouplab.dev/api/badge?url=https://your-server/mcp)
![MCP conformance](https://arctransformationgrouplab.dev/api/badge?repo=owner/repo)
![MCP conformance](https://arctransformationgrouplab.dev/api/badge?grade=A&score=93)
```

## GitHub Action

```yaml
- uses: aking-beep/mcp-conformance-scanner@main
  with:
    target: https://your-server.com/mcp
    min-grade: B
```

## Saved reports

Opt-in only. `POST /api/reports` → `/r/{id}` (30-day TTL). Production needs Upstash Redis
or `REPORT_STORE_DIR`.

---

## Roadmap

This scanner is **frozen** as ARC Labs Release #1.

**Coming soon (sister tools):** Prompt Reviewer · Prompt Injection Scanner · AI Security Scanner · Architecture Generator.

See [ROADMAP.md](./ROADMAP.md) and the live [/roadmap](https://arctransformationgrouplab.dev/roadmap) page.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Small, focused PRs welcome — especially better check
remediation copy and spec references. Please don’t open PRs for accounts, billing, or dashboards.

---

## Known limitations

- **GitHub / Docker scans are static** — they don’t run a live MCP handshake. Use an endpoint scan for full grades.
- **Compatibility is an estimate** based on observed capabilities, not a guarantee from each vendor.
- **Public demo rate-limits** requests (durable only when Upstash Redis is configured).
- **Email capture is optional** — on save/share of a report, not required to scan.
- **Saved permalinks** require a configured store; without it, JSON/Markdown export still works.
- **SSRF protections** block scanning private/link-local addresses from the hosted app.
- Spec URLs in recommendations track current MCP docs and may lag new revisions.

---

## License

MIT · Built by **ARC Labs**.
