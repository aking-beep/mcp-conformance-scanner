#!/usr/bin/env node
// Local CLI: npm run scan -- https://your-server/mcp
//        or: npm run scan -- owner/repo
//        or: npm run scan -- --docker ghcr.io/org/image:tag
// Prints a conformance summary to the terminal. Exits non-zero on grade < C.

import { isDockerImageArg } from "../lib/mcp/docker";
import { parseGithubRepo } from "../lib/mcp/github";
import { runScan } from "../lib/mcp/scan";
import type { ScanTarget } from "../lib/mcp/types";

const RESET = "\x1b[0m";
const c = (code: string, s: string) => `\x1b[${code}m${s}${RESET}`;
const statusColor: Record<string, (s: string) => string> = {
  pass: (s) => c("32", s),
  warn: (s) => c("33", s),
  fail: (s) => c("31", s),
  skip: (s) => c("90", s),
};
const glyph: Record<string, string> = { pass: "✓", warn: "!", fail: "✗", skip: "–" };

function parseArgs(argv: string[]): { kindHint?: "endpoint" | "github" | "docker"; value?: string } {
  let kindHint: "endpoint" | "github" | "docker" | undefined;
  const rest: string[] = [];
  for (const a of argv) {
    if (a === "--docker" || a === "-d") kindHint = "docker";
    else if (a === "--github" || a === "-g") kindHint = "github";
    else if (a === "--endpoint" || a === "-e") kindHint = "endpoint";
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: npm run scan -- [--docker|--github|--endpoint] <target>

Targets:
  https://host/mcp          MCP endpoint (live handshake)
  owner/repo                GitHub repository (static)
  name/image:tag            Docker / OCI image (registry metadata)
`);
      process.exit(0);
    } else rest.push(a);
  }
  return { kindHint, value: rest[0] };
}

function toTarget(arg: string, kindHint?: "endpoint" | "github" | "docker"): ScanTarget {
  if (kindHint === "docker") return { kind: "docker", image: arg };
  if (kindHint === "github") return { kind: "github", repo: arg };
  if (kindHint === "endpoint") return { kind: "endpoint", url: arg };

  if (/^https?:\/\//i.test(arg) && !/github\.com/i.test(arg)) {
    return { kind: "endpoint", url: arg };
  }
  if (isDockerImageArg(arg)) {
    return { kind: "docker", image: arg };
  }
  if (parseGithubRepo(arg)) {
    return { kind: "github", repo: arg };
  }
  if (/^https?:\/\//i.test(arg)) {
    return { kind: "endpoint", url: arg };
  }
  // Ambiguous user/name with no tag — prefer docker hub style when -- not set?
  // Default to github for owner/repo; use --docker for hub images without tags.
  return { kind: "endpoint", url: arg };
}

async function main() {
  const { kindHint, value: arg } = parseArgs(process.argv.slice(2));
  if (!arg) {
    console.error("Usage: npm run scan -- [--docker|--github|--endpoint] <target>");
    process.exit(2);
  }
  const target = toTarget(arg, kindHint);
  const label =
    target.kind === "github" ? target.repo : target.kind === "endpoint" ? target.url : target.image;
  console.log(c("36", `\nScanning ${label} (${target.kind}) ...\n`));

  const r = await runScan(target);

  if (!r.reachable) {
    const msg =
      target.kind === "github"
        ? "Repository not reachable."
        : target.kind === "docker"
        ? "Image not reachable."
        : "Endpoint not reachable.";
    console.error(c("31", msg));
    r.errors.forEach((e) => console.error("  " + e));
    process.exit(1);
  }

  console.log(`${c("1", "Server")}       ${r.serverInfo?.name ?? "unknown"} ${r.serverInfo?.version ?? ""}`);
  console.log(`${c("1", "MCP version")}  ${r.mcpVersion ?? "unknown"}`);
  console.log(`${c("1", "Transport")}    ${r.transport}   ${c("1", "Latency")} ${r.latencyMs ?? "?"}ms`);
  console.log(`${c("1", "Inventory")}    ${r.counts.tools} tools · ${r.counts.resources} resources · ${r.counts.prompts} prompts\n`);

  for (const cat of r.categories) {
    if (!cat.checks.some((k) => k.status !== "skip")) continue;
    console.log(c("1", `${cat.label}  (${cat.score}/100)`));
    for (const k of cat.checks) {
      if (k.status === "skip") continue;
      const col = statusColor[k.status];
      console.log(`  ${col(glyph[k.status])} ${k.label} — ${k.detail}`);
    }
    console.log("");
  }

  console.log(c("1", "Compatibility"));
  for (const row of r.compatibility) {
    console.log(`  ${statusColor[row.status](glyph[row.status])} ${row.platform.padEnd(8)} ${row.note}`);
  }

  console.log("");
  console.log(`${c("1", "Security")}      ${r.security.score}/100 (${r.security.grade})`);
  console.log(`${c("1", "Enterprise")}    ${r.enterpriseReadiness}/100`);
  console.log(`${c("1", "Overall")}       ${c("1", `${r.overall.score}/100  ${r.overall.grade}`)}\n`);

  if (r.recommendations.length) {
    console.log(c("1", "Top recommendations"));
    r.recommendations.slice(0, 5).forEach((rec) =>
      console.log(`  [${rec.priority}] ${rec.title}: ${rec.detail}`),
    );
    console.log("");
  }

  const bad = ["D", "F"].includes(r.overall.grade);
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(c("31", `Error: ${e?.message ?? String(e)}`));
  process.exit(1);
});
