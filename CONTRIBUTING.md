# Contributing

Thanks for helping improve the **MCP Conformance Scanner** (ARC Labs 0.1).

## Scope

This project is intentionally frozen as a focused Labs utility. Great contributions:

- Clearer remediation copy (`lib/mcp/remediation.ts`)
- New or tighter conformance checks with actionable fixes
- Bug fixes, docs, and CI/badge polish
- Export / report clarity

Please **do not** open PRs for:

- User accounts, teams, billing
- Dashboards or product analytics
- AI chat over reports
- Large “platform” refactors

Those belong in future ARC Labs / ARC Platform products — not this scanner.

## Dev setup

```bash
npm install
npm run dev
npm run typecheck
npm run scan -- https://mcp.deepwiki.com/mcp
```

## Pull requests

1. Keep diffs small and focused.
2. Match existing TypeScript / UI patterns.
3. Update `ROADMAP.md` only if the public status of a shipped item changes.
4. Don’t commit secrets (`.env`, Airtable tokens, invite links).

## License

By contributing you agree your changes are licensed under MIT.
