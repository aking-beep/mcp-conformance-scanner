# Public Roadmap — MCP Conformance Scanner

**ARC Labs · 0.9 Beta**

Success metric: **100+ scans**.

## ✅ Shipped
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

Suggest features via the in-app feedback button or GitHub issues.
