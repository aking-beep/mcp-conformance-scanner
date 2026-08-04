# Public Roadmap — MCP Conformance Scanner

Built in the open. Suggest or vote via GitHub issues or the in-app feedback button.

**Success metric for v1: 100+ scans.**

## ✅ Shipped (v0.1 → v0.2)
- MCP endpoint scanning over Streamable HTTP (JSON-RPC 2.0)
- Handshake / version / capabilities validation
- Tool, resource, and prompt validation
- Error-handling probes (unknown method, malformed input)
- Authentication review (enforcement + OAuth/bearer discovery)
- Security checks (TLS, CORS, prompt-injection surface, destructive-tool guardrails)
- Streaming (SSE) detection
- Documentation scoring
- Overall readiness grade + security + enterprise-readiness scores
- Claude / OpenAI / Gemini / Bedrock compatibility matrix
- Recommendations + next steps
- Shareable JSON report (copy / download / link)
- Public API (`POST /api/scan`) and local CLI (`npm run scan`)
- GitHub repository static scanning (`kind: "github"`)
- Conformance badge SVG (`GET /api/badge?url=` / `?repo=`)

## 🔶 In progress
- Deeper OAuth 2.1 flow validation (AS metadata, token refresh)
- Saved reports via optional email capture

## 🔷 Planned
- Docker image pull & inspect (`kind: "docker"`)
- GitHub Action for CI conformance gating
- Historical scans + regression tracking
- Community-submitted check rules
- Public leaderboard of conformant MCP servers

## Non-goals
- Storing scan results without explicit opt-in
- Paywalling basic scanning — it stays free
