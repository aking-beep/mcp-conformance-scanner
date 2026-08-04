# CLAUDE.md — MCP Conformance Scanner

Context for AI agents working in this repo. Read this first.

## What this is
A free developer tool (ARC Labs) that scans an MCP server and grades it on protocol
compliance, security, and multi-model compatibility (Claude / OpenAI / Gemini / Bedrock).
Next.js 14 (App Router) + TypeScript + Tailwind. Deploys to Vercel. MIT licensed.

## Commands
- `npm install` — install deps
- `npm run dev` — dev server at localhost:3000
- `npm run build` — production build (run this to verify compilation)
- `npm run typecheck` — `tsc --noEmit`
- `npm run scan -- <mcp-url>` — local CLI scan (exits non-zero below a C grade)

## Architecture (data flow)
UI (`app/page.tsx`) → `POST /api/scan` (`app/api/scan/route.ts`) → `lib/mcp/scan.ts`
orchestrator, which calls, in order:
1. `lib/mcp/client.ts` — `probeMcpEndpoint()` does the real MCP handshake over Streamable
   HTTP (JSON-RPC 2.0): `initialize` → `notifications/initialized` → `tools/list` /
   `resources/list` / `prompts/list`, plus an unknown-method probe and a malformed-body
   probe. Parses both `application/json` and `text/event-stream`; carries `Mcp-Session-Id`.
   Then `lib/mcp/oauth.ts` discovers RFC 9728 PRM and AS metadata (PKCE / refresh).
   For `kind: "github"`, `lib/mcp/github.ts` statically inspects the repo via the GitHub API.
   For `kind: "docker"`, `lib/mcp/docker.ts` inspects the OCI manifest + config (registry API).
2. `lib/mcp/checks.ts` — `runChecks(probe, url)` → ~20+ `CheckResult`s across 9 categories.
3. `lib/mcp/scoring.ts` — rolls checks into weighted category scores, overall grade
   (weights re-normalize over categories that apply, so absent capabilities don't penalize),
   plus security / enterprise-readiness / documentation scores, recommendations, next steps.
4. `lib/mcp/compatibility.ts` — estimates Claude/OpenAI/Gemini/Bedrock fit from the checks.

`lib/mcp/types.ts` holds all shared types — start there to understand the shapes.
`ScanReport` is the single object the API returns and the UI renders.

## UI
- `components/Report.tsx` — the full report (headline grade, gauges, quick-scan chips,
  compatibility matrix, category breakdown, recommendations, share/download, email capture).
- `components/visuals.tsx` — Gauge, GradeBadge, ScoreBar, StatusChip, color helpers.
- `components/ScanForm.tsx` — tabbed input (endpoint / github / docker).
- `components/Feedback.tsx`, `components/EmailCapture.tsx` — feedback + optional capture.
- All interactive components are `"use client"`.

## Conventions
- Path alias `@/*` → repo root (see tsconfig).
- Tailwind theme colors live in `tailwind.config.ts`; custom component classes are in
  `app/globals.css` under `@layer components` (do NOT `@apply` a custom class outside a layer).
- Check scoring: pass=1, warn=0.5, fail=0, skip=excluded from its category average.
- Never fail a user action on an optional webhook error (feedback/subscribe are best-effort).

## What's done vs. stubbed
- DONE: MCP **endpoint** scanning, end to end.
- DONE: GitHub **repository** static scanning (`kind: "github"`) via GitHub API —
  `lib/mcp/github.ts` (SDK, tools, transport, auth docs, secrets hygiene, README).
- DONE: Docker / OCI **image** scanning (`kind: "docker"`) via registry API —
  `lib/mcp/docker.ts` (manifest + config blob; optional local `docker inspect`).
- DONE: Conformance badge at `GET /api/badge?url=` / `?repo=` / `?image=` (or static `?grade=`).
- DONE: GitHub Action (`action.yml`) + CLI `--min-grade` / `--report` / `--github-output`.
- DONE: Deeper OAuth 2.1 (`lib/mcp/oauth.ts`) — RFC 9728 PRM, AS metadata, PKCE S256,
  refresh_token grant, Dynamic Client Registration discovery.
- DONE: Saved reports (`lib/reports/store.ts`, `/api/reports`, `/r/[id]`) — explicit opt-in
  only, 30-day TTL, filesystem (dev) or Upstash Redis (prod), optional email webhook.
- DONE: Public hardening — SSRF guards, rate limits, server-only report IDs, pre-scan access gate.
- DONE: Airtable lead store (`lib/access/airtable.ts`) — durable CRM for signup PII.
- Roadmap lives in `ROADMAP.md` and `/roadmap`.

## Env (all optional — scanning works with none set)
- `ACCESS_GATE_ENABLED` — default true; require signup before scan.
- `ACCESS_GATE_SECRET` — HMAC secret for access tokens (set in production).
- `AIRTABLE_API_KEY` + `AIRTABLE_BASE_ID` (+ optional `AIRTABLE_LEADS_TABLE`) — durable leads.
- `LEAD_WEBHOOK_URL` — optional secondary notify; falls back to `EMAIL_CAPTURE_WEBHOOK_URL`.
- `EMAIL_CAPTURE_WEBHOOK_URL` — emails the saved-report link; unset = no email.
- `FEEDBACK_WEBHOOK_URL` — feedback destination; unset = console log.
- `NEXT_PUBLIC_BASE_URL` — for absolute share links.
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — production report store / rate limits.
- `REPORT_STORE_DIR` — filesystem report store (defaults to `.data/reports` in development).
- `GITHUB_TOKEN` — higher GitHub API rate limits / private repos / ghcr.io pulls.
- `DOCKER_REGISTRY_TOKEN` — bearer token for private OCI registries.
- `MCP_DOCKER_LOCAL` — set to `1` to also run local `docker image inspect`.

## Notes for the next change
- Production launch checklist: Airtable PAT + base ID, `ACCESS_GATE_SECRET`,
  `NEXT_PUBLIC_BASE_URL`. See `docs/AIRTABLE_LEADS.md`.
- Consider upgrading Next.js past 14.2.5 (security advisory).
- Every ARC Labs tool should keep: modern UI, GitHub repo, API, docs, public roadmap,
  feedback button, shareable report, optional email capture. Preserve these when editing.
