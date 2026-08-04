// Static GitHub repository scanning for MCP servers.
// Uses the public GitHub API (optional GITHUB_TOKEN for higher rate limits).

import type { CheckCategory, CheckResult, CheckStatus } from "./types";

const GITHUB_API = "https://api.github.com";

export interface GithubProbe {
  reachable: boolean;
  owner: string;
  repo: string;
  fullName: string;
  description: string | null;
  htmlUrl: string;
  defaultBranch: string | null;
  license: string | null;
  stars: number;
  language: string | null;
  topics: string[];
  /** Detected MCP-related signals from repo contents. */
  signals: GithubSignals;
  /** Raw file snippets used as evidence (truncated). */
  evidence: Record<string, string>;
  errors: string[];
  latencyMs: number;
}

export interface GithubSignals {
  hasMcpSdk: boolean;
  sdkPackages: string[];
  hasSmithery: boolean;
  hasMcpConfig: boolean;
  hasDockerfile: boolean;
  transportHints: ("stdio" | "sse" | "streamable-http" | "http")[];
  authHints: boolean;
  toolNames: string[];
  resourceHints: boolean;
  promptHints: boolean;
  readmeMentionsMcp: boolean;
  readmeLength: number;
  hasLicenseFile: boolean;
  hasEnvExample: boolean;
  committedEnvRisk: boolean;
  serverInfoName: string | null;
  protocolVersionHint: string | null;
}

function mk(
  id: string,
  category: CheckCategory,
  label: string,
  status: CheckStatus,
  detail: string,
  weight: number,
  fix?: string,
  evidence?: unknown,
): CheckResult {
  const score = status === "pass" ? 1 : status === "warn" ? 0.5 : 0;
  return { id, category, label, status, detail, weight, score, fix, evidence };
}

/** Parse "owner/repo" or a github.com URL into owner + repo. */
export function parseGithubRepo(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim().replace(/\.git$/i, "");
  const urlMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s?#]+)/i,
  );
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }
  const short = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (short) return { owner: short[1], repo: short[2] };
  return null;
}

function authHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "mcp-conformance-scanner",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function ghJson<T>(path: string): Promise<{ ok: boolean; status: number; data: T | null; message?: string }> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: authHeaders(),
    next: { revalidate: 0 },
  });
  if (res.status === 404) return { ok: false, status: 404, data: null, message: "Not found" };
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      /* ignore */
    }
    return { ok: false, status: res.status, data: null, message };
  }
  return { ok: true, status: res.status, data: (await res.json()) as T };
}

async function ghFile(
  owner: string,
  repo: string,
  path: string,
): Promise<string | null> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`, {
    headers: authHeaders(),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { content?: string; encoding?: string; type?: string };
  if (data.type !== "file" || !data.content) return null;
  if (data.encoding === "base64") {
    try {
      return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  return data.content ?? null;
}

async function listRoot(owner: string, repo: string): Promise<string[]> {
  const res = await ghJson<Array<{ name: string; type: string }>>(`/repos/${owner}/${repo}/contents/`);
  if (!res.ok || !res.data) return [];
  return res.data.filter((e) => e.type === "file" || e.type === "dir").map((e) => e.name);
}

const MCP_SDK_PATTERNS = [
  /@modelcontextprotocol\/sdk/i,
  /@modelcontextprotocol\/server/i,
  /mcp\[|mcp\s*>=|mcp==|"mcp"/i,
  /github\.com\/modelcontextprotocol\//i,
  /from\s+mcp\b|import\s+mcp\b/i,
  /require\(["']@modelcontextprotocol/i,
];

const TOOL_NAME_PATTERNS = [
  /(?:name|toolName|tool_name)\s*[:=]\s*["']([a-zA-Z][a-zA-Z0-9_-]{0,63})["']/g,
  /\.tool\(\s*["']([a-zA-Z][a-zA-Z0-9_-]{0,63})["']/g,
  /registerTool\(\s*["']([a-zA-Z][a-zA-Z0-9_-]{0,63})["']/g,
  /@mcp\.tool\(\s*(?:name\s*=\s*)?["']([a-zA-Z][a-zA-Z0-9_-]{0,63})["']/g,
];

function collectToolNames(text: string): string[] {
  const names = new Set<string>();
  for (const re of TOOL_NAME_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const n = m[1];
      // Filter common false positives
      if (!/^(name|type|string|object|id|key|value|true|false|null|export|import|default)$/i.test(n)) {
        names.add(n);
      }
    }
  }
  return [...names].slice(0, 40);
}

function detectTransports(text: string): GithubSignals["transportHints"] {
  const hints = new Set<GithubSignals["transportHints"][number]>();
  if (/\bstdio\b|StdioServerTransport|stdioserver/i.test(text)) hints.add("stdio");
  if (/text\/event-stream|\bSSE\b|SSEServerTransport|EventSource/i.test(text)) hints.add("sse");
  if (/streamable[\s-]?http|StreamableHTTP/i.test(text)) hints.add("streamable-http");
  if (/createServer\(|express\(|fastify|hono|\/mcp\b|mcpHttp|httpTransport/i.test(text) && /mcp/i.test(text)) {
    hints.add("http");
  }
  return [...hints];
}

function emptySignals(): GithubSignals {
  return {
    hasMcpSdk: false,
    sdkPackages: [],
    hasSmithery: false,
    hasMcpConfig: false,
    hasDockerfile: false,
    transportHints: [],
    authHints: false,
    toolNames: [],
    resourceHints: false,
    promptHints: false,
    readmeMentionsMcp: false,
    readmeLength: 0,
    hasLicenseFile: false,
    hasEnvExample: false,
    committedEnvRisk: false,
    serverInfoName: null,
    protocolVersionHint: null,
  };
}

export async function probeGithubRepo(repoInput: string): Promise<GithubProbe> {
  const started = Date.now();
  const parsed = parseGithubRepo(repoInput);
  if (!parsed) {
    return {
      reachable: false,
      owner: "",
      repo: "",
      fullName: repoInput,
      description: null,
      htmlUrl: "",
      defaultBranch: null,
      license: null,
      stars: 0,
      language: null,
      topics: [],
      signals: emptySignals(),
      evidence: {},
      errors: [`Could not parse GitHub repo from "${repoInput}". Use owner/repo or a github.com URL.`],
      latencyMs: Date.now() - started,
    };
  }

  const { owner, repo } = parsed;
  const meta = await ghJson<{
    full_name: string;
    description: string | null;
    html_url: string;
    default_branch: string;
    license: { spdx_id?: string; name?: string } | null;
    stargazers_count: number;
    language: string | null;
    topics?: string[];
    private?: boolean;
  }>(`/repos/${owner}/${repo}`);

  if (!meta.ok || !meta.data) {
    const hint =
      meta.status === 403
        ? " GitHub API rate limit may be hit — set GITHUB_TOKEN for higher limits."
        : meta.status === 404
        ? " Repo not found or private."
        : "";
    return {
      reachable: false,
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      description: null,
      htmlUrl: `https://github.com/${owner}/${repo}`,
      defaultBranch: null,
      license: null,
      stars: 0,
      language: null,
      topics: [],
      signals: emptySignals(),
      evidence: {},
      errors: [`Failed to fetch ${owner}/${repo}: ${meta.message ?? meta.status}.${hint}`],
      latencyMs: Date.now() - started,
    };
  }

  const signals = emptySignals();
  const evidence: Record<string, string> = {};
  const root = await listRoot(owner, repo);
  const rootLower = new Set(root.map((n) => n.toLowerCase()));

  signals.hasDockerfile = rootLower.has("dockerfile") || rootLower.has("dockerfile.mcp");
  signals.hasSmithery = rootLower.has("smithery.yaml") || rootLower.has("smithery.yml");
  signals.hasLicenseFile = ["license", "license.md", "license.txt", "copying"].some((n) => rootLower.has(n));
  signals.hasEnvExample = [...rootLower].some((n) => n.startsWith(".env") && n.includes("example"));
  signals.committedEnvRisk = rootLower.has(".env") || rootLower.has(".env.local");
  signals.hasMcpConfig =
    rootLower.has("mcp.json") ||
    rootLower.has("server.json") ||
    root.some((n) => /mcp/i.test(n) && /\.(json|yaml|yml|toml)$/i.test(n));

  const filesToFetch = [
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "Cargo.toml",
    "go.mod",
    "smithery.yaml",
    "smithery.yml",
    "mcp.json",
    "server.json",
    "README.md",
    "readme.md",
    "README",
  ].filter((f) => root.some((r) => r.toLowerCase() === f.toLowerCase()) || ["package.json", "README.md"].includes(f));

  // Prefer exact case from root listing
  const resolvedFiles = new Set<string>();
  for (const want of filesToFetch) {
    const hit = root.find((r) => r.toLowerCase() === want.toLowerCase());
    if (hit) resolvedFiles.add(hit);
  }
  // Always try package.json / README if present in common locations
  if (!resolvedFiles.size) {
    for (const f of ["package.json", "README.md", "pyproject.toml"]) resolvedFiles.add(f);
  }

  const blobs: Record<string, string> = {};
  await Promise.all(
    [...resolvedFiles].slice(0, 12).map(async (path) => {
      const content = await ghFile(owner, repo, path);
      if (content != null) {
        blobs[path] = content;
        evidence[path] = content.slice(0, 1200);
      }
    }),
  );

  // Scan a few likely source entrypoints for tools / transports
  const sourceCandidates = [
    "src/index.ts",
    "src/index.js",
    "src/server.ts",
    "src/main.ts",
    "index.ts",
    "index.js",
    "server.ts",
    "server.py",
    "main.py",
    "src/mcp_server.py",
    "src/server.py",
  ];
  await Promise.all(
    sourceCandidates.slice(0, 6).map(async (path) => {
      if (blobs[path]) return;
      const content = await ghFile(owner, repo, path);
      if (content != null) {
        blobs[path] = content;
        evidence[path] = content.slice(0, 800);
      }
    }),
  );

  const allText = Object.values(blobs).join("\n\n");
  const pkg = blobs["package.json"] ?? blobs[Object.keys(blobs).find((k) => k.toLowerCase() === "package.json") ?? ""];
  const readmeKey = Object.keys(blobs).find((k) => /^readme/i.test(k));
  const readme = readmeKey ? blobs[readmeKey] : "";

  if (pkg) {
    try {
      const json = JSON.parse(pkg) as {
        name?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      if (json.name) signals.serverInfoName = json.name;
      const deps = { ...json.dependencies, ...json.devDependencies };
      for (const [name, ver] of Object.entries(deps)) {
        if (/modelcontextprotocol|@mcp\//i.test(name) || name === "mcp") {
          signals.hasMcpSdk = true;
          signals.sdkPackages.push(`${name}@${ver}`);
        }
      }
    } catch {
      /* ignore bad package.json */
    }
  }

  for (const pattern of MCP_SDK_PATTERNS) {
    if (pattern.test(allText)) {
      signals.hasMcpSdk = true;
      break;
    }
  }

  if (signals.hasSmithery || blobs["smithery.yaml"] || blobs["smithery.yml"]) {
    signals.hasSmithery = true;
  }

  signals.transportHints = detectTransports(allText + "\n" + (readme || ""));
  signals.authHints = /oauth|www-authenticate|bearer token|authorization server|mcp.?auth/i.test(
    allText + "\n" + (readme || ""),
  );
  signals.toolNames = collectToolNames(allText);
  signals.resourceHints = /resources\/list|ListResources|resources:\s*\{|@mcp\.resource/i.test(allText);
  signals.promptHints = /prompts\/list|ListPrompts|prompts:\s*\{|@mcp\.prompt/i.test(allText);
  signals.readmeMentionsMcp = /model context protocol|\bmcp\b/i.test(readme || "");
  signals.readmeLength = (readme || "").length;

  const versionMatch = allText.match(/protocolVersion\s*[:=]\s*["'](\d{4}-\d{2}-\d{2})["']/);
  if (versionMatch) signals.protocolVersionHint = versionMatch[1];

  const nameMatch = allText.match(/serverInfo\s*:\s*\{[^}]*name\s*:\s*["']([^"']+)["']/);
  if (nameMatch) signals.serverInfoName = nameMatch[1];

  // Topics / description as soft MCP signals
  const topics = meta.data.topics ?? [];
  if (topics.some((t) => /mcp/i.test(t)) || /mcp|model context protocol/i.test(meta.data.description || "")) {
    signals.readmeMentionsMcp = signals.readmeMentionsMcp || true;
  }

  return {
    reachable: true,
    owner,
    repo,
    fullName: meta.data.full_name,
    description: meta.data.description,
    htmlUrl: meta.data.html_url,
    defaultBranch: meta.data.default_branch,
    license: meta.data.license?.spdx_id || meta.data.license?.name || null,
    stars: meta.data.stargazers_count,
    language: meta.data.language,
    topics,
    signals,
    evidence,
    errors: [],
    latencyMs: Date.now() - started,
  };
}

const isPlainName = (n: string) => /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(n);

export function runGithubChecks(probe: GithubProbe): CheckResult[] {
  const checks: CheckResult[] = [];
  const s = probe.signals;

  if (!probe.reachable) {
    checks.push(
      mk(
        "protocol.reachable",
        "protocol",
        "Repository reachable",
        "fail",
        probe.errors[0] ?? "Could not load the GitHub repository.",
        1,
        "Confirm the repo exists and is public, or set GITHUB_TOKEN for private repos.",
      ),
    );
    return checks;
  }

  checks.push(
    mk(
      "protocol.reachable",
      "protocol",
      "Repository reachable",
      "pass",
      `Loaded ${probe.fullName}${probe.stars ? ` (${probe.stars}★)` : ""}.`,
      0.5,
    ),
  );

  checks.push(
    mk(
      "protocol.version",
      "protocol",
      "MCP protocol version in source",
      s.protocolVersionHint ? "pass" : s.hasMcpSdk ? "warn" : "fail",
      s.protocolVersionHint
        ? `Found protocolVersion "${s.protocolVersionHint}" in source.`
        : s.hasMcpSdk
        ? "MCP SDK present but no explicit protocolVersion string found (may be set at runtime)."
        : "No MCP protocol version or SDK detected in scanned files.",
      1,
      s.protocolVersionHint
        ? undefined
        : "Advertise a current protocolVersion (e.g. 2025-06-18) in initialize.",
      { protocolVersionHint: s.protocolVersionHint },
    ),
  );

  checks.push(
    mk(
      "protocol.serverInfo",
      "protocol",
      "Server identity in package/source",
      s.serverInfoName ? "pass" : "warn",
      s.serverInfoName
        ? `Identifies as "${s.serverInfoName}".`
        : "No package name or serverInfo.name found in scanned files.",
      0.6,
      s.serverInfoName ? undefined : "Set serverInfo.name/version in initialize and keep package metadata in sync.",
    ),
  );

  const mcpSignals =
    s.hasMcpSdk || s.hasSmithery || s.hasMcpConfig || s.toolNames.length > 0 || s.readmeMentionsMcp;
  checks.push(
    mk(
      "protocol.capabilities",
      "protocol",
      "MCP project signals",
      mcpSignals ? (s.hasMcpSdk || s.hasSmithery ? "pass" : "warn") : "fail",
      mcpSignals
        ? [
            s.hasMcpSdk ? `SDK: ${s.sdkPackages.join(", ") || "detected"}` : null,
            s.hasSmithery ? "smithery.yaml" : null,
            s.hasMcpConfig ? "MCP config file" : null,
            s.toolNames.length ? `${s.toolNames.length} tool name(s)` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "MCP mentioned in docs/topics."
        : "No MCP SDK, config, tools, or docs signals found in the repo root / common entrypoints.",
      0.8,
      mcpSignals
        ? undefined
        : "Add the official MCP SDK and advertise capabilities (tools/resources/prompts) clearly.",
      { sdkPackages: s.sdkPackages, hasSmithery: s.hasSmithery },
    ),
  );

  // Tools
  if (s.toolNames.length) {
    const well = s.toolNames.filter(isPlainName);
    const pct = Math.round((well.length / s.toolNames.length) * 100);
    checks.push(
      mk(
        "tools.list",
        "tools",
        "Tool definitions in source",
        "pass",
        `Found ${s.toolNames.length} tool name(s) via static analysis.`,
        0.8,
        undefined,
        { tools: s.toolNames },
      ),
    );
    checks.push(
      mk(
        "tools.naming",
        "tools",
        "Tool naming convention",
        pct === 100 ? "pass" : pct >= 80 ? "warn" : "fail",
        `${pct}% of detected tool names look model-friendly.`,
        1,
        pct === 100 ? undefined : "Rename tools to ^[a-zA-Z][a-zA-Z0-9_-]{0,63}$.",
      ),
    );
    checks.push(
      mk(
        "tools.schema",
        "tools",
        "Tool input schemas",
        "warn",
        "Static scan cannot fully validate runtime inputSchema objects — confirm each tool exposes typed JSON Schema.",
        1,
        "Ensure every tool has inputSchema: { type: 'object', properties: ... }.",
      ),
    );
    checks.push(
      mk(
        "tools.descriptions",
        "tools",
        "Tool descriptions",
        "warn",
        "Descriptions are not fully verified in a static pass — spot-check that each tool has a clear description.",
        0.8,
        "Add action-oriented descriptions; models select tools primarily from these.",
      ),
    );
  } else {
    checks.push(
      mk(
        "tools.list",
        "tools",
        "Tool definitions in source",
        s.hasMcpSdk ? "warn" : "skip",
        s.hasMcpSdk
          ? "MCP SDK detected but no tool registrations matched common patterns in scanned files."
          : "No tools detected; category skipped for this static scan.",
        0.8,
        s.hasMcpSdk
          ? "Export tools with clear names (tool(), registerTool, @mcp.tool) near your server entrypoint."
          : undefined,
      ),
    );
  }

  // Resources / prompts
  checks.push(
    mk(
      "resources.list",
      "resources",
      "Resources support",
      s.resourceHints ? "pass" : "skip",
      s.resourceHints
        ? "Source suggests resources capability / list handlers."
        : "No resources signals in scanned files.",
      0.8,
    ),
  );
  checks.push(
    mk(
      "prompts.list",
      "prompts",
      "Prompts support",
      s.promptHints ? "pass" : "skip",
      s.promptHints ? "Source suggests prompts capability / list handlers." : "No prompts signals in scanned files.",
      0.8,
    ),
  );

  // Errors — can't live-probe; document expectation
  checks.push(
    mk(
      "errors.unknownMethod",
      "errors",
      "Error-handling (static)",
      "skip",
      "Unknown-method and malformed-body probes require a live MCP endpoint.",
      1,
      "After deploy, scan the running endpoint to validate JSON-RPC -32601 / -32700 behavior.",
    ),
  );
  checks.push(
    mk(
      "errors.malformed",
      "errors",
      "Malformed-request handling",
      "skip",
      "Skipped for repository scans.",
      0.8,
    ),
  );

  // Auth
  checks.push(
    mk(
      "auth.required",
      "auth",
      "Auth documentation",
      s.authHints ? "pass" : "warn",
      s.authHints
        ? "Repo mentions OAuth/bearer or MCP auth."
        : "No OAuth/auth guidance found in scanned files — fine for local stdio demos.",
      0.7,
      s.authHints ? undefined : "Document auth for any remote/network transport (MCP OAuth 2.1).",
    ),
  );
  checks.push(
    mk(
      "auth.scheme",
      "auth",
      "OAuth / bearer guidance",
      s.authHints ? "pass" : "warn",
      s.authHints ? "Auth scheme discussed in docs or source." : "No WWW-Authenticate / OAuth flow docs spotted.",
      1,
      "For remote servers, implement MCP OAuth 2.1 with AS metadata.",
    ),
  );

  // Streaming / transport
  const remote =
    s.transportHints.includes("sse") ||
    s.transportHints.includes("streamable-http") ||
    s.transportHints.includes("http");
  const stdioOnly = s.transportHints.includes("stdio") && !remote;
  checks.push(
    mk(
      "streaming.support",
      "streaming",
      "Transport surface",
      remote ? "pass" : stdioOnly ? "warn" : s.hasMcpSdk ? "warn" : "skip",
      remote
        ? `Looks network-capable: ${s.transportHints.join(", ")}.`
        : stdioOnly
        ? "Appears stdio-only — great for local clients; remote hosts need Streamable HTTP / SSE."
        : s.hasMcpSdk
        ? "Could not classify transport from scanned files."
        : "No transport signals found.",
      1,
      remote ? undefined : "Add Streamable HTTP (text/event-stream) for hosted / multi-client use.",
      { transportHints: s.transportHints },
    ),
  );

  // Security
  checks.push(
    mk(
      "security.tls",
      "security",
      "Remote TLS posture",
      remote ? "warn" : "skip",
      remote
        ? "Repo suggests an HTTP transport — confirm production endpoints are HTTPS-only."
        : "No remote HTTP transport detected; TLS check deferred.",
      1,
      remote ? "Terminate TLS at the edge and never expose bearer tokens over cleartext." : undefined,
    ),
  );
  checks.push(
    mk(
      "security.cors",
      "security",
      "CORS posture",
      "skip",
      "CORS is only observable on a live HTTP endpoint.",
      0.7,
    ),
  );
  checks.push(
    mk(
      "security.secrets",
      "security",
      "Secrets hygiene",
      s.committedEnvRisk ? "fail" : s.hasEnvExample ? "pass" : "warn",
      s.committedEnvRisk
        ? "A committed .env / .env.local was found at the repo root — high risk of leaked secrets."
        : s.hasEnvExample
        ? "Uses .env.example (good) without committing live env files at root."
        : "No .env.example spotted; ensure secrets stay out of git.",
      0.7,
      s.committedEnvRisk
        ? "Remove committed env files, rotate any exposed secrets, and add them to .gitignore."
        : "Add .env.example documenting required vars without real values.",
    ),
  );
  checks.push(
    mk(
      "security.injection",
      "security",
      "Prompt-injection surface",
      "warn",
      "Static analysis cannot inspect live tool metadata for injection-style phrases — verify descriptions don't embed model instructions.",
      0.9,
      "Treat tool output as untrusted; keep descriptions free of 'ignore previous' / system-prompt language.",
    ),
  );
  checks.push(
    mk(
      "security.dockerfile",
      "security",
      "Dockerfile / supply chain",
      s.hasDockerfile ? "pass" : "warn",
      s.hasDockerfile
        ? "Dockerfile present — pin base images and avoid baking secrets into layers."
        : "No Dockerfile at repo root; optional for stdio servers, useful for reproducible deploys.",
      0.5,
      s.hasDockerfile ? undefined : "Add a minimal Dockerfile for consistent hosted deployments.",
    ),
  );
  const destructive = s.toolNames.filter((t) =>
    /delete|drop|remove|wipe|exec|shell|payment|transfer|write|update/i.test(t),
  );
  checks.push(
    mk(
      "security.destructive",
      "security",
      "Destructive-tool names",
      destructive.length === 0 ? (s.toolNames.length ? "pass" : "skip") : "warn",
      destructive.length === 0
        ? s.toolNames.length
          ? "No obviously destructive tool names detected."
          : "No tools to assess."
        : `${destructive.length} tool name(s) look state-changing: ${destructive.slice(0, 5).join(", ")}.`,
      0.8,
      destructive.length
        ? "Gate destructive tools behind confirmation and least-privilege scopes."
        : undefined,
      destructive,
    ),
  );

  // Docs
  const docsStatus =
    s.readmeLength >= 800 && s.readmeMentionsMcp
      ? "pass"
      : s.readmeLength >= 200
      ? "warn"
      : "fail";
  checks.push(
    mk(
      "docs.toolDocs",
      "docs",
      "README / MCP documentation",
      docsStatus,
      s.readmeLength
        ? `README ~${s.readmeLength} chars${s.readmeMentionsMcp ? ", mentions MCP" : ", little/no MCP mention"}.`
        : "No README found in scanned files.",
      1,
      docsStatus === "pass"
        ? undefined
        : "Document install, transport, tools, and auth in README so clients can onboard quickly.",
    ),
  );
  checks.push(
    mk(
      "docs.serverIdentity",
      "docs",
      "License & packaging",
      probe.license || s.hasLicenseFile ? "pass" : "warn",
      probe.license
        ? `License: ${probe.license}.`
        : s.hasLicenseFile
        ? "License file present."
        : "No license detected — hard for enterprises to adopt.",
      0.6,
      probe.license || s.hasLicenseFile ? undefined : "Add an SPDX license (MIT is common for MCP servers).",
    ),
  );

  return checks;
}
