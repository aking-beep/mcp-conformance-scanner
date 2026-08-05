# Public Roadmap — MCP Conformance Scanner

**ARC Labs 0.1 · Release #1** — frozen as a focused Labs utility.

Success metric for this release: **100+ scans**.

## ✅ Shipped (ARC Labs 0.1)
- MCP endpoint scanning over Streamable HTTP (JSON-RPC 2.0)
- Handshake / version / capabilities validation
- Tool, resource, and prompt validation
- Error-handling probes (unknown method, malformed input)
- Authentication review + OAuth 2.1 (PRM, AS metadata, PKCE S256, refresh_token, DCR)
- Security checks (TLS, CORS, prompt-injection surface, destructive-tool guardrails)
- Streaming (SSE) detection
- Documentation scoring
- Overall score /100 + letter grade
- Claude / OpenAI / Gemini / Bedrock compatibility matrix
- Actionable recommendations (issue / why it matters / suggested fix / reference)
- Export Markdown + JSON · download · opt-in permalink (`/r/[id]`)
- Public API (`POST /api/scan`) and local CLI (`npm run scan`)
- GitHub repository static scanning · Docker / OCI metadata scanning
- Conformance badge SVG (`GET /api/badge`)
- GitHub Action for CI conformance gating (`action.yml`, `--min-grade`)

## 🔜 Coming soon — ARC Labs suite
- Prompt Reviewer
- Prompt Injection Scanner
- AI Security Scanner
- Architecture Generator

## ❌ Intentionally not building (on this scanner)
- User accounts / teams
- Billing
- Dashboards / product analytics
- AI chat
- Complex multi-page report builders

## Non-goals
- Storing scan results without explicit opt-in
- Paywalling basic scanning — it stays free
- Turning this into the ARC Platform (separate vision, separate products)
