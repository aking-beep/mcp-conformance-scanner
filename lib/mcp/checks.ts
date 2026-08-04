// Conformance checks. Each check inspects the probe and returns a CheckResult.
// Scoring: pass=1, warn=0.5, fail=0, skip=excluded from its category average.

import type { McpProbe } from "./client";
import { asSupportsPkceS256, asSupportsRefresh } from "./oauth";
import type { CheckCategory, CheckResult, CheckStatus } from "./types";

// Known MCP protocol revisions, newest first.
const KNOWN_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

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

const isPlainName = (n: string) => /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(n);

export function runChecks(probe: McpProbe, url?: string): CheckResult[] {
  const checks: CheckResult[] = [];
  const initRes = probe.raw.initialize?.result;
  const tools: any[] = probe.raw.tools?.result?.tools ?? [];
  const resources: any[] = probe.raw.resources?.result?.resources ?? [];
  const prompts: any[] = probe.raw.prompts?.result?.prompts ?? [];

  // ---------- PROTOCOL ----------
  if (!probe.reachable) {
    checks.push(mk("protocol.reachable", "protocol", "Endpoint reachable", "fail",
      "The endpoint did not respond to an MCP initialize request.", 1,
      "Confirm the server is running and the URL points at the MCP transport endpoint (often /mcp)."));
    return checks; // nothing else is meaningful
  }
  checks.push(mk("protocol.reachable", "protocol", "Endpoint reachable", "pass",
    "Server responded to the MCP handshake.", 0.5));

  if (probe.protocolVersion) {
    const known = KNOWN_VERSIONS.includes(probe.protocolVersion);
    const latest = probe.protocolVersion === KNOWN_VERSIONS[0];
    checks.push(mk("protocol.version", "protocol", "MCP version detected",
      latest ? "pass" : known ? "warn" : "warn",
      latest
        ? `Reports protocol version ${probe.protocolVersion} (current).`
        : known
        ? `Reports ${probe.protocolVersion}; a newer revision (${KNOWN_VERSIONS[0]}) exists.`
        : `Reports an unrecognized version "${probe.protocolVersion}".`,
      1,
      latest ? undefined : `Upgrade to protocol revision ${KNOWN_VERSIONS[0]} for the latest transport and auth semantics.`,
      { reported: probe.protocolVersion }));
  } else {
    checks.push(mk("protocol.version", "protocol", "MCP version detected", "fail",
      "initialize did not return a protocolVersion.", 1,
      "Return `protocolVersion` in the initialize result per the MCP spec."));
  }

  checks.push(mk("protocol.serverInfo", "protocol", "serverInfo present",
    probe.serverInfo?.name ? "pass" : "warn",
    probe.serverInfo?.name
      ? `Identifies as "${probe.serverInfo.name}"${probe.serverInfo.version ? ` v${probe.serverInfo.version}` : ""}.`
      : "initialize did not include serverInfo.name/version.",
    0.6,
    probe.serverInfo?.name ? undefined : "Populate serverInfo.name and serverInfo.version in the initialize result."));

  checks.push(mk("protocol.capabilities", "protocol", "Capabilities advertised",
    probe.capabilities && Object.keys(probe.capabilities).length ? "pass" : "warn",
    probe.capabilities && Object.keys(probe.capabilities).length
      ? `Advertises: ${Object.keys(probe.capabilities).join(", ")}.`
      : "No capabilities object returned from initialize.",
    0.8,
    "Advertise the capabilities your server supports (tools, resources, prompts, logging, etc.).",
    probe.capabilities));

  // ---------- TOOLS ----------
  const toolsCap = !!probe.capabilities?.tools;
  if (probe.raw.tools?.result) {
    checks.push(mk("tools.list", "tools", "tools/list responds", "pass",
      `Returned ${tools.length} tool(s).`, 0.8));

    const named = tools.filter((t) => t?.name);
    const wellNamed = named.filter((t) => isPlainName(t.name));
    const namingPct = named.length ? Math.round((wellNamed.length / named.length) * 100) : 100;
    checks.push(mk("tools.naming", "tools", "Tool naming convention",
      namingPct === 100 ? "pass" : namingPct >= 80 ? "warn" : "fail",
      `${namingPct}% of tools use safe, model-friendly names (letters/digits/_/-).`, 1,
      namingPct === 100 ? undefined : "Rename tools to match ^[a-zA-Z][a-zA-Z0-9_-]{0,63}$ so every model can call them.",
      { namingPct }));

    const withSchema = tools.filter((t) => t?.inputSchema && t.inputSchema.type === "object");
    const schemaPct = tools.length ? Math.round((withSchema.length / tools.length) * 100) : 100;
    checks.push(mk("tools.schema", "tools", "Tool input schemas valid",
      schemaPct === 100 ? "pass" : schemaPct >= 70 ? "warn" : "fail",
      tools.length
        ? `${schemaPct}% of tools expose a JSON-Schema object inputSchema.`
        : "No tools to validate.",
      1,
      schemaPct === 100 ? undefined : "Give every tool an `inputSchema` of type `object` with typed properties.",
      { schemaPct }));

    const withDesc = tools.filter((t) => (t?.description || "").trim().length >= 12);
    const descPct = tools.length ? Math.round((withDesc.length / tools.length) * 100) : 100;
    checks.push(mk("tools.descriptions", "tools", "Tool descriptions",
      descPct >= 90 ? "pass" : descPct >= 60 ? "warn" : "fail",
      tools.length ? `${descPct}% of tools have a meaningful description.` : "No tools to validate.",
      0.8,
      descPct >= 90 ? undefined : "Add clear, action-oriented descriptions; models select tools primarily from these."));
  } else if (toolsCap) {
    checks.push(mk("tools.list", "tools", "tools/list responds", "fail",
      "Server advertised the tools capability but tools/list failed.", 1,
      "Implement tools/list to return your tool definitions."));
  } else {
    checks.push(mk("tools.list", "tools", "tools/list responds", "skip",
      "Server does not advertise the tools capability.", 1));
  }

  // ---------- RESOURCES ----------
  if (probe.capabilities?.resources) {
    if (probe.raw.resources?.result) {
      const withUri = resources.filter((r) => typeof r?.uri === "string" && r.uri.includes(":"));
      const uriPct = resources.length ? Math.round((withUri.length / resources.length) * 100) : 100;
      checks.push(mk("resources.list", "resources", "resources/list responds", "pass",
        `Returned ${resources.length} resource(s).`, 0.8));
      checks.push(mk("resources.uris", "resources", "Resource URIs well-formed",
        uriPct === 100 ? "pass" : uriPct >= 80 ? "warn" : "fail",
        resources.length ? `${uriPct}% of resources use a scheme-qualified URI.` : "No resources listed.",
        1,
        uriPct === 100 ? undefined : "Use scheme-qualified URIs (e.g. file://, https://, custom://) for every resource.",
        { uriPct }));
    } else {
      checks.push(mk("resources.list", "resources", "resources/list responds", "fail",
        "Resources capability advertised but resources/list failed.", 1,
        "Implement resources/list or drop the resources capability."));
    }
  } else {
    checks.push(mk("resources.list", "resources", "Resources supported", "skip",
      "Server does not advertise the resources capability.", 1));
  }

  // ---------- PROMPTS ----------
  if (probe.capabilities?.prompts) {
    if (probe.raw.prompts?.result) {
      const named = prompts.filter((p) => p?.name && isPlainName(p.name));
      const okPct = prompts.length ? Math.round((named.length / prompts.length) * 100) : 100;
      checks.push(mk("prompts.list", "prompts", "prompts/list responds", "pass",
        `Returned ${prompts.length} prompt(s).`, 0.8));
      checks.push(mk("prompts.valid", "prompts", "Prompt definitions valid",
        okPct === 100 ? "pass" : okPct >= 80 ? "warn" : "fail",
        prompts.length ? `${okPct}% of prompts have valid names.` : "No prompts listed.",
        1,
        okPct === 100 ? undefined : "Give each prompt a valid name and declare its arguments."));
    } else {
      checks.push(mk("prompts.list", "prompts", "prompts/list responds", "fail",
        "Prompts capability advertised but prompts/list failed.", 1,
        "Implement prompts/list or drop the prompts capability."));
    }
  } else {
    checks.push(mk("prompts.list", "prompts", "Prompts supported", "skip",
      "Server does not advertise the prompts capability.", 1));
  }

  // ---------- ERROR HANDLING ----------
  const inv = probe.raw.invalidMethod;
  const invOk = inv?.error && inv.error.code === -32601;
  const invGraceful = !!inv?.error;
  checks.push(mk("errors.unknownMethod", "errors", "Unknown-method handling",
    invOk ? "pass" : invGraceful ? "warn" : "fail",
    invOk
      ? "Unknown method returns JSON-RPC error -32601 (Method not found)."
      : invGraceful
      ? `Unknown method returns a JSON-RPC error (code ${inv?.error?.code}), but not the spec's -32601.`
      : "Unknown method did not return a proper JSON-RPC error.",
    1,
    invOk ? undefined : "Return `-32601 Method not found` for unknown JSON-RPC methods.",
    inv?.error));

  const mal = probe.raw.malformed;
  const malGraceful = mal && mal.httpStatus < 500;
  checks.push(mk("errors.malformed", "errors", "Malformed-request handling",
    malGraceful ? "pass" : mal ? "warn" : "skip",
    mal
      ? malGraceful
        ? `Malformed JSON handled gracefully (HTTP ${mal.httpStatus}).`
        : `Malformed JSON produced HTTP ${mal.httpStatus} (server error).`
      : "Could not test malformed input.",
    0.8,
    malGraceful ? undefined : "Return a 400 with JSON-RPC parse error (-32700) instead of a 5xx on bad input."));

  // ---------- AUTH ----------
  const authRequired = probe.httpMeta.initHttpStatus === 401 || probe.httpMeta.initHttpStatus === 403;
  const wwwAuth = probe.httpMeta.wwwAuthenticate || "";
  const looksOAuth = /bearer|oauth|dpop/i.test(wwwAuth);
  const oauth = probe.oauth;
  const hasPrm = !!oauth?.prm;
  const hasAs = !!oauth?.asMetadata;
  const asMeta = oauth?.asMetadata ?? null;

  if (authRequired) {
    checks.push(mk("auth.required", "auth", "Authentication enforced", "pass",
      `Endpoint requires auth (HTTP ${probe.httpMeta.initHttpStatus}).`, 0.7));
    checks.push(mk("auth.scheme", "auth", "Auth scheme advertised",
      looksOAuth ? "pass" : wwwAuth ? "warn" : "warn",
      wwwAuth ? `WWW-Authenticate: ${wwwAuth.slice(0, 180)}` : "Auth required but no WWW-Authenticate challenge returned.",
      1,
      looksOAuth ? undefined : "Advertise OAuth 2.1 / bearer via a WWW-Authenticate challenge so clients can discover it."));
  } else {
    checks.push(mk("auth.required", "auth", "Authentication", hasPrm ? "pass" : "warn",
      hasPrm
        ? "Endpoint is reachable without a token, but Protected Resource Metadata is published (optional / mixed auth)."
        : "Endpoint responded to initialize with no authentication. Fine for public/demo servers, risky for anything with side effects.",
      0.7,
      hasPrm ? undefined : "For non-public servers, require OAuth 2.1 bearer tokens (MCP auth spec)."));
    checks.push(mk("auth.scheme", "auth", "OAuth support",
      looksOAuth || hasPrm ? "pass" : "warn",
      looksOAuth
        ? "OAuth/bearer challenge present."
        : hasPrm
        ? "No WWW-Authenticate on the open path; OAuth discovered via Protected Resource Metadata."
        : "No OAuth challenge or Protected Resource Metadata observed.",
      1,
      looksOAuth || hasPrm
        ? undefined
        : "Implement the MCP OAuth 2.1 flow (authorization server metadata + token refresh) for production use."));
  }

  // Protected Resource Metadata (RFC 9728)
  if (authRequired || hasPrm || oauth?.resourceMetadataUrl) {
    const prmStatus: CheckStatus = hasPrm
      ? "pass"
      : authRequired
      ? "fail"
      : "skip";
    checks.push(mk("auth.prm", "auth", "Protected Resource Metadata",
      prmStatus,
      hasPrm
        ? `PRM found via ${oauth?.prmSource} at ${oauth?.prmUrl}.`
        : authRequired
        ? "No RFC 9728 Protected Resource Metadata document discovered (WWW-Authenticate resource_metadata or well-known)."
        : "PRM not published (optional when the server is fully public).",
      1,
      hasPrm
        ? undefined
        : "Serve /.well-known/oauth-protected-resource and include resource_metadata on 401 WWW-Authenticate.",
      hasPrm
        ? {
            resource: oauth?.prm?.resource,
            authorization_servers: oauth?.prm?.authorization_servers,
            scopes_supported: oauth?.prm?.scopes_supported,
          }
        : undefined));

    if (hasPrm) {
      const servers = oauth?.prm?.authorization_servers ?? [];
      checks.push(mk("auth.prm.servers", "auth", "authorization_servers listed",
        servers.length ? "pass" : "fail",
        servers.length
          ? `Trusts ${servers.length} authorization server(s): ${servers.slice(0, 2).join(", ")}${servers.length > 2 ? "…" : ""}.`
          : "PRM document is missing authorization_servers (required by MCP).",
        0.9,
        servers.length ? undefined : "Include at least one authorization_servers entry in the PRM document."));
    }
  } else {
    checks.push(mk("auth.prm", "auth", "Protected Resource Metadata", "skip",
      "Skipped — public endpoint with no OAuth discovery signals.", 1));
  }

  // Authorization Server metadata (RFC 8414 / OIDC)
  if (hasPrm || authRequired) {
    checks.push(mk("auth.asMetadata", "auth", "Authorization Server metadata",
      hasAs ? "pass" : hasPrm ? "fail" : "warn",
      hasAs
        ? `AS metadata via ${oauth?.asMetadataSource} (${oauth?.asMetadataUrl}).`
        : hasPrm
        ? "PRM lists an authorization server but its metadata document was not reachable."
        : "No authorization server to probe.",
      1,
      hasAs
        ? undefined
        : "Publish RFC 8414 (.well-known/oauth-authorization-server) or OIDC Discovery metadata.",
      hasAs
        ? {
            issuer: asMeta?.issuer,
            authorization_endpoint: asMeta?.authorization_endpoint,
            token_endpoint: asMeta?.token_endpoint,
          }
        : undefined));

    const hasAuthz = !!asMeta?.authorization_endpoint;
    const hasToken = !!asMeta?.token_endpoint;
    let tokenEndpointDetail = "No AS metadata to validate endpoints.";
    if (hasAs) {
      tokenEndpointDetail =
        hasAuthz && hasToken
          ? "authorization_endpoint and token_endpoint are present."
          : `Missing ${[!hasAuthz && "authorization_endpoint", !hasToken && "token_endpoint"].filter(Boolean).join(" and ")}.`;
    }
    checks.push(mk("auth.tokenEndpoint", "auth", "Token + authorize endpoints",
      hasAs ? (hasAuthz && hasToken ? "pass" : "fail") : "skip",
      tokenEndpointDetail,
      0.9,
      hasAuthz && hasToken
        ? undefined
        : "AS metadata must advertise authorization_endpoint and token_endpoint."));

    // PKCE S256 — required for MCP clients per the authorization spec
    const pkce = asSupportsPkceS256(asMeta);
    const pkceMethods = asMeta?.code_challenge_methods_supported;
    let pkceDetail = "No AS metadata.";
    if (hasAs) {
      if (pkce) {
        pkceDetail = `code_challenge_methods_supported includes S256 (${(pkceMethods ?? []).join(", ")}).`;
      } else if (Array.isArray(pkceMethods)) {
        pkceDetail = `PKCE methods ${JSON.stringify(pkceMethods)} do not include S256 — MCP clients must refuse to proceed.`;
      } else {
        pkceDetail = "code_challenge_methods_supported is missing — MCP clients must refuse to proceed.";
      }
    }
    checks.push(mk("auth.pkce", "auth", "PKCE S256 support",
      hasAs ? (pkce ? "pass" : "fail") : "skip",
      pkceDetail,
      1,
      pkce
        ? undefined
        : 'Advertise code_challenge_methods_supported: ["S256"] in AS / OIDC metadata.'));

    // Refresh tokens
    const refresh = asSupportsRefresh(asMeta);
    const grants = asMeta?.grant_types_supported;
    let refreshDetail = "No AS metadata.";
    if (hasAs) {
      if (refresh) {
        refreshDetail = "grant_types_supported includes refresh_token.";
      } else if (Array.isArray(grants)) {
        refreshDetail = `grant_types_supported=${JSON.stringify(grants)} — no refresh_token (clients cannot silently renew).`;
      } else {
        refreshDetail = "grant_types_supported omitted — cannot confirm refresh_token support.";
      }
    }
    checks.push(mk("auth.refresh", "auth", "Refresh token grant",
      hasAs ? (refresh ? "pass" : "warn") : "skip",
      refreshDetail,
      0.8,
      refresh
        ? undefined
        : "Support the refresh_token grant so long-lived MCP sessions can renew access tokens."));

    // Dynamic Client Registration (optional but valuable for MCP)
    checks.push(mk("auth.dcr", "auth", "Dynamic Client Registration",
      hasAs ? (asMeta?.registration_endpoint ? "pass" : "warn") : "skip",
      hasAs
        ? asMeta?.registration_endpoint
          ? `registration_endpoint: ${asMeta.registration_endpoint}`
          : "No registration_endpoint — clients need pre-registered credentials or CIMD."
        : "No AS metadata.",
      0.5,
      asMeta?.registration_endpoint
        ? undefined
        : "Offer RFC 7591 Dynamic Client Registration or document Client ID Metadata Documents."));
  } else {
    for (const [id, label] of [
      ["auth.asMetadata", "Authorization Server metadata"],
      ["auth.tokenEndpoint", "Token + authorize endpoints"],
      ["auth.pkce", "PKCE S256 support"],
      ["auth.refresh", "Refresh token grant"],
      ["auth.dcr", "Dynamic Client Registration"],
    ] as const) {
      checks.push(mk(id, "auth", label, "skip",
        "Skipped — no OAuth discovery surface on this public endpoint.", 0.8));
    }
  }

  // ---------- STREAMING ----------
  const ct = probe.httpMeta.contentType || "";
  const streams = ct.includes("text/event-stream");
  checks.push(mk("streaming.support", "streaming", "Streaming (SSE) support",
    streams ? "pass" : "warn",
    streams
      ? "Server uses text/event-stream (Streamable HTTP), enabling progress + partial results."
      : "Server replied with a single JSON body; streaming not observed on this request.",
    1,
    streams ? undefined : "Support text/event-stream responses so long-running tools can stream progress."));

  // ---------- SECURITY ----------
  const usesHttps = url ? url.trim().toLowerCase().startsWith("https://") : true;
  checks.push(mk("security.tls", "security", "TLS / HTTPS", usesHttps ? "pass" : "fail",
    usesHttps ? "Endpoint is served over HTTPS." : "Endpoint is not HTTPS.", 1,
    usesHttps ? undefined : "Serve the MCP endpoint over HTTPS; tokens and tool I/O must not travel in cleartext."));

  const cors = probe.httpMeta.corsAllowOrigin;
  const wildcardCors = cors === "*";
  checks.push(mk("security.cors", "security", "CORS posture",
    cors == null ? "pass" : wildcardCors ? "warn" : "pass",
    cors == null
      ? "No wildcard CORS header exposed."
      : wildcardCors
      ? "Access-Control-Allow-Origin: * — any site can call this server from a browser."
      : `CORS restricted to ${cors}.`,
    0.7,
    wildcardCors ? "Restrict Access-Control-Allow-Origin to trusted origins, especially if auth is cookie-based." : undefined));

  // Prompt-injection posture: heuristic on tool descriptions.
  const injectionHits = tools.filter((t) =>
    /ignore (previous|prior)|system prompt|exfiltrat|disregard/i.test(
      `${t?.description ?? ""} ${JSON.stringify(t?.inputSchema ?? {})}`,
    ),
  );
  checks.push(mk("security.injection", "security", "Prompt-injection surface",
    injectionHits.length === 0 ? "pass" : "warn",
    injectionHits.length === 0
      ? "No obvious injection-style language found in tool metadata."
      : `${injectionHits.length} tool(s) contain instruction-like phrases in metadata that a model could be steered by.`,
    0.9,
    injectionHits.length === 0 ? undefined : "Treat all tool output as untrusted; strip/label model-directed instructions and add allow-lists.",
    injectionHits.map((t) => t.name)));

  const destructive = tools.filter((t) =>
    /delete|drop|remove|wipe|exec|shell|payment|transfer|write|update/i.test(t?.name ?? ""),
  );
  checks.push(mk("security.destructive", "security", "Destructive-tool guardrails",
    destructive.length === 0 ? "pass" : "warn",
    destructive.length === 0
      ? "No obviously destructive tools detected."
      : `${destructive.length} tool(s) look state-changing/destructive. Confirm they require confirmation + scoping.`,
    0.8,
    destructive.length === 0 ? undefined : "Gate destructive tools behind explicit user confirmation and least-privilege scopes.",
    destructive.map((t) => t.name)));

  // ---------- DOCS ----------
  const toolDocPct = tools.length
    ? Math.round((tools.filter((t) => (t?.description || "").length >= 12).length / tools.length) * 100)
    : null;
  checks.push(mk("docs.toolDocs", "docs", "Inline tool documentation",
    toolDocPct == null ? "skip" : toolDocPct >= 90 ? "pass" : toolDocPct >= 60 ? "warn" : "fail",
    toolDocPct == null ? "No tools to document." : `${toolDocPct}% of tools are documented inline.`,
    1,
    toolDocPct != null && toolDocPct < 90 ? "Document every tool inline; this is the primary docs surface models see." : undefined));

  checks.push(mk("docs.serverIdentity", "docs", "Server self-identifies",
    probe.serverInfo?.name && probe.serverInfo?.version ? "pass" : "warn",
    probe.serverInfo?.name && probe.serverInfo?.version
      ? "serverInfo provides both name and version for support/debugging."
      : "serverInfo is missing name and/or version.",
    0.6,
    probe.serverInfo?.name && probe.serverInfo?.version ? undefined : "Return serverInfo.name and serverInfo.version so clients can log and support you."));

  return checks;
}
