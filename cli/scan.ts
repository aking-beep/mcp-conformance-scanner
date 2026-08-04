#!/usr/bin/env node
// Local CLI / CI entrypoint.
//   npm run scan -- https://your-server/mcp
//   npm run scan -- owner/repo
//   npm run scan -- --docker ghcr.io/org/image:tag
//   npm run scan -- --min-grade=B https://your-server/mcp

import { writeFileSync, appendFileSync } from "node:fs";
import { isDockerImageArg } from "../lib/mcp/docker";
import { GRADE_LIST, meetsMinGrade, parseGrade } from "../lib/mcp/grades";
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

type KindHint = "endpoint" | "github" | "docker";

function parseArgs(argv: string[]): {
  kindHint?: KindHint;
  value?: string;
  minGrade: string;
  reportPath?: string;
  githubOutput: boolean;
  quiet: boolean;
} {
  let kindHint: KindHint | undefined;
  let minGrade = "C";
  let reportPath: string | undefined;
  let githubOutput = false;
  let quiet = false;
  const rest: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--docker" || a === "-d") kindHint = "docker";
    else if (a === "--github" || a === "-g") kindHint = "github";
    else if (a === "--endpoint" || a === "-e") kindHint = "endpoint";
    else if (a === "--github-output") githubOutput = true;
    else if (a === "--quiet" || a === "-q") quiet = true;
    else if (a.startsWith("--min-grade=")) minGrade = a.slice("--min-grade=".length);
    else if (a === "--min-grade") minGrade = argv[++i] ?? minGrade;
    else if (a.startsWith("--report=")) reportPath = a.slice("--report=".length);
    else if (a === "--report") reportPath = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: npm run scan -- [options] <target>

Options:
  --endpoint | -e       Treat target as an MCP endpoint URL
  --github   | -g       Treat target as a GitHub owner/repo
  --docker   | -d       Treat target as a Docker/OCI image
  --min-grade <grade>   Fail if overall grade is below this (default: C)
                        Grades: ${GRADE_LIST}
  --report <path>       Write the full JSON ScanReport to a file
  --github-output       Append grade/score/reachable to $GITHUB_OUTPUT
  --quiet    | -q       Suppress the human summary (still prints errors)

Targets:
  https://host/mcp          MCP endpoint (live handshake)
  owner/repo                GitHub repository (static)
  name/image:tag            Docker / OCI image (registry metadata)
`);
      process.exit(0);
    } else rest.push(a);
  }
  return { kindHint, value: rest[0], minGrade, reportPath, githubOutput, quiet };
}

function toTarget(arg: string, kindHint?: KindHint): ScanTarget {
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
  return { kind: "endpoint", url: arg };
}

function writeGithubOutput(fields: Record<string, string>) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) {
    for (const [k, v] of Object.entries(fields)) console.log(`${k}=${v}`);
    return;
  }
  appendFileSync(out, Object.entries(fields).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.value) {
    console.error("Usage: npm run scan -- [--docker|--github|--endpoint] [--min-grade=C] <target>");
    process.exit(2);
  }

  const min = parseGrade(opts.minGrade);
  if (!min) {
    console.error(`Invalid --min-grade "${opts.minGrade}". Expected one of: ${GRADE_LIST}`);
    process.exit(2);
  }

  const target = toTarget(opts.value, opts.kindHint);
  const label =
    target.kind === "github" ? target.repo : target.kind === "endpoint" ? target.url : target.image;

  if (!opts.quiet) console.log(c("36", `\nScanning ${label} (${target.kind}) ...\n`));

  const r = await runScan(target);

  if (opts.reportPath) {
    writeFileSync(opts.reportPath, JSON.stringify(r, null, 2));
    if (!opts.quiet) console.log(c("90", `Wrote report → ${opts.reportPath}\n`));
  }

  if (opts.githubOutput) {
    writeGithubOutput({
      grade: r.overall.grade,
      score: String(r.overall.score),
      reachable: String(r.reachable),
      kind: target.kind,
    });
  }

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

  if (!opts.quiet) {
    console.log(`${c("1", "Server")}       ${r.serverInfo?.name ?? "unknown"} ${r.serverInfo?.version ?? ""}`);
    console.log(`${c("1", "MCP version")}  ${r.mcpVersion ?? "unknown"}`);
    console.log(`${c("1", "Transport")}    ${r.transport}   ${c("1", "Latency")} ${r.latencyMs ?? "?"}ms`);
    console.log(
      `${c("1", "Inventory")}    ${r.counts.tools} tools · ${r.counts.resources} resources · ${r.counts.prompts} prompts\n`,
    );

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
  } else {
    console.log(`${r.overall.grade} ${r.overall.score}`);
  }

  if (!meetsMinGrade(r.overall.grade, min)) {
    console.error(
      c("31", `Grade ${r.overall.grade} (${r.overall.score}) is below minimum ${min}.`),
    );
    process.exit(1);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(c("31", `Error: ${e?.message ?? String(e)}`));
  process.exit(1);
});
