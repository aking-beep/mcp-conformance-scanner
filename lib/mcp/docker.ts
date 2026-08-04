// Docker / OCI image inspection for MCP servers.
// Primary path: registry HTTP API (works on Vercel — no daemon required).
// Optional enrichment: local `docker inspect` when the CLI is available.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CheckCategory, CheckResult, CheckStatus } from "./types";

const execFileAsync = promisify(execFile);

export interface ParsedImageRef {
  /** Original user input */
  input: string;
  /** Registry host, e.g. registry-1.docker.io or ghcr.io */
  registry: string;
  /** Repository path without host, e.g. library/ubuntu or org/mcp-server */
  repository: string;
  /** Tag or digest (without sha256: prefix handling for tags) */
  reference: string;
  /** True when reference is a digest */
  isDigest: boolean;
  /** Canonical display name */
  display: string;
}

export interface DockerSignals {
  hasMcpLabel: boolean;
  hasMcpEnv: boolean;
  hasMcpInCommand: boolean;
  hasMcpInHistory: boolean;
  transportHints: ("stdio" | "sse" | "streamable-http" | "http")[];
  authHints: boolean;
  exposedPorts: string[];
  runsAsRoot: boolean;
  hasHealthcheck: boolean;
  baseImageHint: string | null;
  serverName: string | null;
  protocolVersionHint: string | null;
  labels: Record<string, string>;
  entrypoint: string[];
  cmd: string[];
  envKeys: string[];
  user: string | null;
  created: string | null;
  architecture: string | null;
  os: string | null;
  sizeBytes: number | null;
  source: "registry" | "local-docker" | "mixed";
}

export interface DockerProbe {
  reachable: boolean;
  ref: ParsedImageRef | null;
  signals: DockerSignals;
  evidence: Record<string, unknown>;
  errors: string[];
  latencyMs: number;
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

function emptySignals(): DockerSignals {
  return {
    hasMcpLabel: false,
    hasMcpEnv: false,
    hasMcpInCommand: false,
    hasMcpInHistory: false,
    transportHints: [],
    authHints: false,
    exposedPorts: [],
    runsAsRoot: true,
    hasHealthcheck: false,
    baseImageHint: null,
    serverName: null,
    protocolVersionHint: null,
    labels: {},
    entrypoint: [],
    cmd: [],
    envKeys: [],
    user: null,
    created: null,
    architecture: null,
    os: null,
    sizeBytes: null,
    source: "registry",
  };
}

/** Parse docker image references into registry + repository + tag/digest. */
export function parseDockerImage(input: string): ParsedImageRef | null {
  let raw = input.trim().replace(/^docker:\/\//i, "");
  if (!raw || /\s/.test(raw)) return null;
  // Reject obvious non-images
  if (/^https?:\/\//i.test(raw) || /^git@/i.test(raw)) return null;

  let reference = "latest";
  let isDigest = false;

  const digestIdx = raw.indexOf("@");
  if (digestIdx !== -1) {
    reference = raw.slice(digestIdx + 1);
    raw = raw.slice(0, digestIdx);
    isDigest = true;
  } else {
    // Tag is after the last colon, but only if the colon isn't part of host:port
    const lastColon = raw.lastIndexOf(":");
    const lastSlash = raw.lastIndexOf("/");
    if (lastColon > lastSlash && lastColon !== -1) {
      const maybeTag = raw.slice(lastColon + 1);
      if (/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(maybeTag)) {
        reference = maybeTag;
        raw = raw.slice(0, lastColon);
      }
    }
  }

  if (!raw) return null;

  const parts = raw.split("/");
  let registry = "registry-1.docker.io";
  let repository: string;

  const first = parts[0];
  const looksLikeHost = first.includes(".") || first.includes(":") || first === "localhost";

  if (parts.length === 1) {
    // ubuntu → library/ubuntu
    repository = `library/${parts[0]}`;
  } else if (looksLikeHost) {
    registry = first === "docker.io" ? "registry-1.docker.io" : first;
    repository = parts.slice(1).join("/");
    if (registry === "registry-1.docker.io" && !repository.includes("/")) {
      repository = `library/${repository}`;
    }
  } else {
    // user/image on Docker Hub
    repository = parts.join("/");
  }

  if (!repository || repository.endsWith("/")) return null;

  const hostDisplay =
    registry === "registry-1.docker.io" ? "" : `${registry}/`;
  const display = `${hostDisplay}${repository}${isDigest ? `@${reference}` : `:${reference}`}`;

  return { input, registry, repository, reference, isDigest, display };
}

function looksLikeDockerImage(arg: string): boolean {
  if (parseDockerImage(arg) == null) return false;
  // Prefer github owner/repo when it matches both shapes unless it has a registry/tag smell
  const hasRegistry = /^(ghcr\.io|gcr\.io|quay\.io|docker\.io|registry\.|localhost)/i.test(arg);
  const hasTag = /:[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(arg) || arg.includes("@sha256:");
  const hasDockerHint = hasRegistry || hasTag || arg.startsWith("library/");
  return hasDockerHint;
}

export function isDockerImageArg(arg: string): boolean {
  return looksLikeDockerImage(arg);
}

function registryBase(registry: string): string {
  if (registry === "registry-1.docker.io") return "https://registry-1.docker.io";
  if (registry.includes("://")) return registry.replace(/\/$/, "");
  return `https://${registry}`;
}

async function getRegistryToken(
  registry: string,
  repository: string,
  wwwAuthenticate?: string | null,
): Promise<string | null> {
  // Prefer challenge from 401
  let realm: string | null = null;
  let service: string | null = null;
  let scope: string | null = `repository:${repository}:pull`;

  if (wwwAuthenticate) {
    const realmM = wwwAuthenticate.match(/realm="([^"]+)"/i);
    const serviceM = wwwAuthenticate.match(/service="([^"]+)"/i);
    const scopeM = wwwAuthenticate.match(/scope="([^"]+)"/i);
    realm = realmM?.[1] ?? null;
    service = serviceM?.[1] ?? null;
    if (scopeM?.[1]) scope = scopeM[1];
  }

  if (!realm) {
    if (registry === "registry-1.docker.io" || registry === "docker.io") {
      realm = "https://auth.docker.io/token";
      service = "registry.docker.io";
    } else if (registry === "ghcr.io") {
      realm = "https://ghcr.io/token";
      service = "ghcr.io";
    } else {
      // Many registries accept anonymous pulls without a token
      return null;
    }
  }

  const url = new URL(realm);
  if (service) url.searchParams.set("service", service);
  if (scope) url.searchParams.set("scope", scope);

  const headers: Record<string, string> = { Accept: "application/json" };
  // GHCR private images: reuse GITHUB_TOKEN when present
  if (registry === "ghcr.io" && process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  if (process.env.DOCKER_REGISTRY_TOKEN) {
    headers.Authorization = `Bearer ${process.env.DOCKER_REGISTRY_TOKEN}`;
  }

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return null;
  const data = (await res.json()) as { token?: string; access_token?: string };
  return data.token || data.access_token || null;
}

const MANIFEST_ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
  "application/vnd.docker.distribution.manifest.v1+json",
].join(", ");

type Manifest = {
  schemaVersion?: number;
  mediaType?: string;
  config?: { digest: string; size?: number; mediaType?: string };
  layers?: Array<{ digest: string; size?: number }>;
  manifests?: Array<{
    digest: string;
    platform?: { architecture?: string; os?: string; variant?: string };
    mediaType?: string;
  }>;
  history?: Array<{ v1Compatibility?: string }>;
};

type ImageConfig = {
  architecture?: string;
  os?: string;
  created?: string;
  config?: {
    User?: string;
    Env?: string[];
    Entrypoint?: string[] | string;
    Cmd?: string[] | string;
    Labels?: Record<string, string> | null;
    ExposedPorts?: Record<string, unknown> | null;
    WorkingDir?: string;
    Healthcheck?: unknown;
  };
  rootfs?: { type?: string; diff_ids?: string[] };
  history?: Array<{ created_by?: string; empty_layer?: boolean }>;
};

function asStringList(v: string[] | string | undefined | null): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String);
  return [String(v)];
}

function analyzeConfig(cfg: ImageConfig, signals: DockerSignals) {
  const c = cfg.config ?? {};
  signals.architecture = cfg.architecture ?? signals.architecture;
  signals.os = cfg.os ?? signals.os;
  signals.created = cfg.created ?? signals.created;
  signals.user = c.User || null;
  signals.runsAsRoot = !c.User || c.User === "0" || c.User === "root" || c.User.startsWith("0:");
  signals.hasHealthcheck = !!c.Healthcheck;
  signals.labels = { ...(c.Labels ?? {}) };
  signals.entrypoint = asStringList(c.Entrypoint);
  signals.cmd = asStringList(c.Cmd);
  signals.exposedPorts = Object.keys(c.ExposedPorts ?? {});
  signals.envKeys = (c.Env ?? []).map((e) => e.split("=")[0]).filter(Boolean);

  const labelText = Object.entries(signals.labels)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const envText = (c.Env ?? []).join("\n");
  const cmdText = [...signals.entrypoint, ...signals.cmd].join(" ");
  const historyText = (cfg.history ?? []).map((h) => h.created_by ?? "").join("\n");
  const blob = `${labelText}\n${envText}\n${cmdText}\n${historyText}`;

  signals.hasMcpLabel = /mcp|model.?context.?protocol/i.test(labelText);
  signals.hasMcpEnv = /mcp|model.?context.?protocol/i.test(envText);
  signals.hasMcpInCommand = /\bmcp\b|modelcontextprotocol|@modelcontextprotocol/i.test(cmdText);
  signals.hasMcpInHistory = /modelcontextprotocol|mcp-server|\bmcp\b/i.test(historyText);

  const transports = new Set<DockerSignals["transportHints"][number]>();
  if (/\bstdio\b/i.test(blob)) transports.add("stdio");
  if (/text\/event-stream|\bsse\b|SSEServer/i.test(blob)) transports.add("sse");
  if (/streamable[\s-]?http|StreamableHTTP/i.test(blob)) transports.add("streamable-http");
  if (/\/mcp\b|mcpHttp|PORT=|EXPOSE|\bhttp\b/i.test(blob) && /mcp/i.test(blob)) transports.add("http");
  if (signals.exposedPorts.length && /mcp/i.test(blob)) transports.add("http");
  signals.transportHints = [...transports];

  signals.authHints = /oauth|bearer|www-authenticate|mcp.?auth/i.test(blob);

  const nameFromLabel =
    signals.labels["mcp.server.name"] ||
    signals.labels["org.mcp.server.name"] ||
    signals.labels["com.docker.extension.title"] ||
    signals.labels["org.opencontainers.image.title"];
  if (nameFromLabel) signals.serverName = nameFromLabel;

  const ver =
    blob.match(/protocolVersion[=:\s]+["']?(\d{4}-\d{2}-\d{2})/i)?.[1] ||
    signals.labels["mcp.protocol.version"] ||
    signals.labels["org.mcp.protocol.version"];
  if (ver) signals.protocolVersionHint = ver;

  const baseLabel =
    signals.labels["org.opencontainers.image.base.name"] ||
    signals.labels["org.opencontainers.image.base.digest"];
  if (baseLabel) {
    signals.baseImageHint = baseLabel;
  } else {
    const fromLine = (cfg.history ?? [])
      .map((h) => h.created_by ?? "")
      .find((line) => /(^|\s)FROM\s+\S+/i.test(line) && !/--from=/i.test(line));
    const m = fromLine?.match(/\bFROM\s+([a-z0-9][a-z0-9._\-/:@]+)/i);
    if (m?.[1] && !/^(as|source)$/i.test(m[1])) signals.baseImageHint = m[1];
  }
}

async function fetchManifest(
  registry: string,
  repository: string,
  reference: string,
  token: string | null,
): Promise<{ manifest: Manifest; digest: string | null; status: number; wwwAuth: string | null }> {
  const url = `${registryBase(registry)}/v2/${repository}/manifests/${encodeURIComponent(reference)}`;
  const headers: Record<string, string> = { Accept: MANIFEST_ACCEPT };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  const wwwAuth = res.headers.get("www-authenticate");
  if (!res.ok) {
    return { manifest: {}, digest: null, status: res.status, wwwAuth };
  }
  const digest = res.headers.get("docker-content-digest");
  const manifest = (await res.json()) as Manifest;
  return { manifest, digest, status: res.status, wwwAuth };
}

async function fetchBlobJson<T>(
  registry: string,
  repository: string,
  digest: string,
  token: string | null,
): Promise<T | null> {
  const url = `${registryBase(registry)}/v2/${repository}/blobs/${digest}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

function pickPlatformManifest(index: Manifest): string | null {
  const list = index.manifests ?? [];
  if (!list.length) return null;
  const amd = list.find(
    (m) => m.platform?.os === "linux" && (m.platform.architecture === "amd64" || m.platform.architecture === "x86_64"),
  );
  const linux = list.find((m) => m.platform?.os === "linux");
  return (amd ?? linux ?? list[0])?.digest ?? null;
}

async function tryLocalDockerInspect(image: string): Promise<{
  ok: boolean;
  config?: ImageConfig;
  size?: number;
  error?: string;
}> {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      ["image", "inspect", image, "--format", "{{json .}}"],
      { timeout: 15000, maxBuffer: 2 * 1024 * 1024 },
    );
    const data = JSON.parse(stdout) as {
      Size?: number;
      Architecture?: string;
      Os?: string;
      Config?: ImageConfig["config"];
      RootFS?: unknown;
      Created?: string;
    };
    const config: ImageConfig = {
      architecture: data.Architecture,
      os: data.Os,
      created: data.Created,
      config: data.Config,
    };
    return { ok: true, config, size: data.Size };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

export async function probeDockerImage(imageInput: string): Promise<DockerProbe> {
  const started = Date.now();
  const ref = parseDockerImage(imageInput);
  if (!ref) {
    return {
      reachable: false,
      ref: null,
      signals: emptySignals(),
      evidence: {},
      errors: [
        `Could not parse Docker image reference "${imageInput}". Use name:tag, ghcr.io/org/image:tag, or a digest.`,
      ],
      latencyMs: Date.now() - started,
    };
  }

  const signals = emptySignals();
  const evidence: Record<string, unknown> = { ref };
  const errors: string[] = [];

  // --- Registry path ---
  let token = await getRegistryToken(ref.registry, ref.repository);
  let result = await fetchManifest(ref.registry, ref.repository, ref.reference, token);

  if (result.status === 401 || result.status === 403) {
    token = await getRegistryToken(ref.registry, ref.repository, result.wwwAuth);
    result = await fetchManifest(ref.registry, ref.repository, ref.reference, token);
  }

  if (result.status === 404) {
    // Fall back to local docker if the image might only exist locally
    const local = await tryLocalDockerInspect(ref.input);
    if (local.ok && local.config) {
      signals.source = "local-docker";
      analyzeConfig(local.config, signals);
      signals.sizeBytes = local.size ?? null;
      evidence.localInspect = true;
      return {
        reachable: true,
        ref,
        signals,
        evidence,
        errors: ["Image not found on the remote registry; used local docker inspect instead."],
        latencyMs: Date.now() - started,
      };
    }
    return {
      reachable: false,
      ref,
      signals,
      evidence,
      errors: [
        `Image ${ref.display} was not found on ${ref.registry} (HTTP 404). Check the name/tag or auth for private registries.`,
      ],
      latencyMs: Date.now() - started,
    };
  }

  if (result.status >= 400 || !result.manifest) {
    const local = await tryLocalDockerInspect(ref.input);
    if (local.ok && local.config) {
      signals.source = "local-docker";
      analyzeConfig(local.config, signals);
      signals.sizeBytes = local.size ?? null;
      evidence.localInspect = true;
      return {
        reachable: true,
        ref,
        signals,
        evidence,
        errors: [
          `Registry returned HTTP ${result.status}; used local docker inspect instead.`,
        ],
        latencyMs: Date.now() - started,
      };
    }
    return {
      reachable: false,
      ref,
      signals,
      evidence,
      errors: [
        `Failed to fetch manifest for ${ref.display} (HTTP ${result.status}).${
          result.status === 401 ? " Private registries need DOCKER_REGISTRY_TOKEN (or GITHUB_TOKEN for ghcr.io)." : ""
        }`,
      ],
      latencyMs: Date.now() - started,
    };
  }

  let manifest = result.manifest;
  evidence.manifestMediaType = manifest.mediaType;
  evidence.contentDigest = result.digest;

  // Resolve multi-arch index → platform manifest
  if (manifest.manifests?.length) {
    const platformDigest = pickPlatformManifest(manifest);
    evidence.index = true;
    if (platformDigest) {
      const nested = await fetchManifest(ref.registry, ref.repository, platformDigest, token);
      if (nested.status === 200) {
        manifest = nested.manifest;
        evidence.platformDigest = platformDigest;
      }
    }
  }

  if (manifest.config?.digest) {
    const cfg = await fetchBlobJson<ImageConfig>(
      ref.registry,
      ref.repository,
      manifest.config.digest,
      token,
    );
    if (cfg) {
      analyzeConfig(cfg, signals);
      evidence.configDigest = manifest.config.digest;
      const layerSize = (manifest.layers ?? []).reduce((a, l) => a + (l.size ?? 0), 0);
      signals.sizeBytes = layerSize || manifest.config.size || null;
    } else {
      errors.push("Fetched the manifest but could not download the image config blob.");
    }
  } else if (manifest.history?.length) {
    // Schema v1 compatibility
    try {
      const compat = JSON.parse(manifest.history[0].v1Compatibility || "{}") as ImageConfig;
      analyzeConfig(compat, signals);
    } catch {
      errors.push("Manifest had no OCI config digest and v1 history could not be parsed.");
    }
  } else {
    errors.push("Manifest did not include an image config — limited analysis only.");
  }

  // Optional local enrichment only when explicitly requested (avoids hung Docker Desktop
  // and keeps the Vercel/serverless path pure-registry).
  if (process.env.MCP_DOCKER_LOCAL === "1") {
    const local = await tryLocalDockerInspect(ref.display);
    if (local.ok && local.config) {
      signals.source = "mixed";
      analyzeConfig(local.config, signals);
      if (local.size) signals.sizeBytes = local.size;
      evidence.localInspect = true;
    }
  }

  const mcpish =
    signals.hasMcpLabel ||
    signals.hasMcpEnv ||
    signals.hasMcpInCommand ||
    signals.hasMcpInHistory ||
    /mcp/i.test(ref.repository);

  if (!mcpish) {
    errors.push(
      "No strong MCP signals in image metadata — this may still be an MCP server if tools are registered only at runtime.",
    );
  }

  return {
    reachable: true,
    ref,
    signals,
    evidence,
    errors,
    latencyMs: Date.now() - started,
  };
}

export function runDockerChecks(probe: DockerProbe): CheckResult[] {
  const checks: CheckResult[] = [];
  const s = probe.signals;

  if (!probe.reachable || !probe.ref) {
    checks.push(
      mk(
        "protocol.reachable",
        "protocol",
        "Image reachable",
        "fail",
        probe.errors[0] ?? "Could not load the Docker/OCI image.",
        1,
        "Confirm the image name/tag is public, or set DOCKER_REGISTRY_TOKEN / GITHUB_TOKEN for private registries.",
      ),
    );
    return checks;
  }

  const sizeMb = s.sizeBytes != null ? `${(s.sizeBytes / (1024 * 1024)).toFixed(1)} MiB` : null;
  checks.push(
    mk(
      "protocol.reachable",
      "protocol",
      "Image reachable",
      "pass",
      `Resolved ${probe.ref.display}${sizeMb ? ` (${sizeMb})` : ""}${s.architecture ? ` · ${s.os}/${s.architecture}` : ""}.`,
      0.5,
      undefined,
      { source: s.source },
    ),
  );

  const mcpSignals =
    s.hasMcpLabel || s.hasMcpEnv || s.hasMcpInCommand || s.hasMcpInHistory || /mcp/i.test(probe.ref.repository);

  checks.push(
    mk(
      "protocol.version",
      "protocol",
      "MCP protocol version in image",
      s.protocolVersionHint ? "pass" : mcpSignals ? "warn" : "fail",
      s.protocolVersionHint
        ? `Found protocol version hint "${s.protocolVersionHint}".`
        : mcpSignals
        ? "MCP-related metadata present but no protocolVersion label/env found."
        : "No MCP protocol version or MCP metadata detected in the image config.",
      1,
      "Set label mcp.protocol.version (or org.mcp.protocol.version) and return protocolVersion from initialize.",
      { protocolVersionHint: s.protocolVersionHint },
    ),
  );

  checks.push(
    mk(
      "protocol.serverInfo",
      "protocol",
      "Server identity labels",
      s.serverName ? "pass" : "warn",
      s.serverName
        ? `Image identifies as "${s.serverName}".`
        : "No mcp.server.name / OCI title label found.",
      0.6,
      "Add OCI labels: org.opencontainers.image.title and mcp.server.name.",
    ),
  );

  checks.push(
    mk(
      "protocol.capabilities",
      "protocol",
      "MCP image signals",
      mcpSignals ? (s.hasMcpLabel || s.hasMcpInCommand ? "pass" : "warn") : "fail",
      mcpSignals
        ? [
            s.hasMcpLabel ? "MCP labels" : null,
            s.hasMcpEnv ? "MCP env" : null,
            s.hasMcpInCommand ? "MCP in entrypoint/cmd" : null,
            s.hasMcpInHistory ? "MCP in build history" : null,
            /mcp/i.test(probe.ref.repository) ? "mcp in image name" : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : "Image config does not advertise MCP (labels, env, command, or history).",
      0.8,
      mcpSignals
        ? undefined
        : "Bake MCP metadata into the image (labels + documented entrypoint) so scanners can classify it.",
    ),
  );

  // Tools — can't list without running; skip/warn
  checks.push(
    mk(
      "tools.list",
      "tools",
      "Tool inventory",
      "skip",
      "Tool definitions require a running MCP endpoint — image metadata cannot list tools.",
      0.8,
      "Expose Streamable HTTP and run an endpoint scan after deploy.",
    ),
  );

  checks.push(
    mk(
      "resources.list",
      "resources",
      "Resources support",
      "skip",
      "Resources are not visible from image metadata alone.",
      0.8,
    ),
  );
  checks.push(
    mk(
      "prompts.list",
      "prompts",
      "Prompts support",
      "skip",
      "Prompts are not visible from image metadata alone.",
      0.8,
    ),
  );

  checks.push(
    mk(
      "errors.unknownMethod",
      "errors",
      "Error-handling (image)",
      "skip",
      "JSON-RPC error probes require a live MCP endpoint.",
      1,
    ),
  );
  checks.push(
    mk(
      "errors.malformed",
      "errors",
      "Malformed-request handling",
      "skip",
      "Skipped for image scans.",
      0.8,
    ),
  );

  checks.push(
    mk(
      "auth.required",
      "auth",
      "Auth metadata",
      s.authHints ? "pass" : "warn",
      s.authHints
        ? "Image metadata mentions OAuth/bearer / MCP auth."
        : "No auth guidance in labels/env/command — fine for local stdio images.",
      0.7,
      s.authHints ? undefined : "Document required auth for any network-exposed MCP port.",
    ),
  );
  checks.push(
    mk(
      "auth.scheme",
      "auth",
      "OAuth / bearer guidance",
      s.authHints ? "pass" : "warn",
      s.authHints ? "Auth scheme hinted in image metadata." : "No OAuth/bearer hints in image config.",
      1,
    ),
  );

  const remote =
    s.transportHints.includes("sse") ||
    s.transportHints.includes("streamable-http") ||
    s.transportHints.includes("http") ||
    s.exposedPorts.length > 0;
  const stdioOnly = s.transportHints.includes("stdio") && !remote;

  checks.push(
    mk(
      "streaming.support",
      "streaming",
      "Transport surface",
      remote ? "pass" : stdioOnly ? "warn" : mcpSignals ? "warn" : "skip",
      remote
        ? `Network-facing signals: ${[
            ...s.transportHints,
            s.exposedPorts.length ? `ports ${s.exposedPorts.join(",")}` : null,
          ]
            .filter(Boolean)
            .join(", ")}.`
        : stdioOnly
        ? "Appears stdio-oriented from metadata."
        : mcpSignals
        ? "Could not classify transport; consider labeling mcp.transport=stdio|streamable-http."
        : "No transport signals found.",
      1,
      remote ? undefined : "For hosted use, expose Streamable HTTP and set mcp.transport label.",
      { transportHints: s.transportHints, exposedPorts: s.exposedPorts },
    ),
  );

  checks.push(
    mk(
      "security.tls",
      "security",
      "Non-root user",
      s.runsAsRoot ? "warn" : "pass",
      s.runsAsRoot
        ? `Container user is "${s.user ?? "root"}" — prefer a non-root USER in the Dockerfile.`
        : `Runs as non-root user "${s.user}".`,
      1,
      s.runsAsRoot ? "Add a non-root USER before ENTRYPOINT." : undefined,
    ),
  );

  checks.push(
    mk(
      "security.cors",
      "security",
      "Exposed ports",
      s.exposedPorts.length === 0 ? (stdioOnly || !remote ? "pass" : "warn") : "pass",
      s.exposedPorts.length
        ? `EXPOSE/ports declared: ${s.exposedPorts.join(", ")}.`
        : "No exposed ports in image config (typical for stdio MCP servers).",
      0.7,
    ),
  );

  const secretEnv = s.envKeys.filter((k) =>
    /secret|password|token|api[_-]?key|private[_-]?key/i.test(k),
  );
  checks.push(
    mk(
      "security.secrets",
      "security",
      "Secret env keys baked in",
      secretEnv.length ? "fail" : "pass",
      secretEnv.length
        ? `Image config references sensitive env keys: ${secretEnv.slice(0, 6).join(", ")}. Confirm values aren't baked into layers.`
        : "No obvious secret-named env keys in the image config.",
      0.9,
      secretEnv.length
        ? "Pass secrets at runtime; never COPY .env or ARG secrets into the final image."
        : undefined,
      secretEnv,
    ),
  );

  checks.push(
    mk(
      "security.injection",
      "security",
      "Healthcheck / operability",
      s.hasHealthcheck ? "pass" : remote ? "warn" : "skip",
      s.hasHealthcheck
        ? "HEALTHCHECK present."
        : remote
        ? "Network image without HEALTHCHECK — harder to operate safely in orchestrators."
        : "Healthcheck not applicable for stdio-only images.",
      0.6,
      remote && !s.hasHealthcheck ? "Add a HEALTHCHECK against your MCP HTTP readiness path." : undefined,
    ),
  );

  checks.push(
    mk(
      "security.destructive",
      "security",
      "Base image transparency",
      s.baseImageHint ? "pass" : "warn",
      s.baseImageHint
        ? `Base image hint: ${s.baseImageHint}.`
        : "No OCI base-image label found — pin and declare org.opencontainers.image.base.name.",
      0.5,
      s.baseImageHint ? undefined : "Label the base image and pin digests for supply-chain review.",
    ),
  );

  const labelCount = Object.keys(s.labels).length;
  checks.push(
    mk(
      "docs.toolDocs",
      "docs",
      "OCI / MCP labels",
      labelCount >= 3 || s.hasMcpLabel ? "pass" : labelCount > 0 ? "warn" : "fail",
      labelCount
        ? `${labelCount} label(s) on the image${s.hasMcpLabel ? " (includes MCP)" : ""}.`
        : "No OCI labels — README-in-registry is missing.",
      1,
      "Add org.opencontainers.image.* and mcp.* labels (name, transport, protocol version).",
    ),
  );

  checks.push(
    mk(
      "docs.serverIdentity",
      "docs",
      "Entrypoint clarity",
      s.entrypoint.length || s.cmd.length ? "pass" : "warn",
      s.entrypoint.length || s.cmd.length
        ? `Command: ${[...s.entrypoint, ...s.cmd].join(" ").slice(0, 120)}`
        : "No ENTRYPOINT/CMD in image config.",
      0.6,
      "Set a clear ENTRYPOINT so clients know how to launch the MCP server.",
    ),
  );

  return checks;
}
