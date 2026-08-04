// Minimal MCP client over "Streamable HTTP" (JSON-RPC 2.0).
// Handles both application/json and text/event-stream responses, session ids,
// and gracefully degrades so the scanner can report what it observed.

import { discoverOAuth, type OAuthDiscovery } from "./oauth";
import { assertPublicHttpUrl, safeFetch, sanitizeUserHeaders } from "@/lib/security/ssrf";

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: any;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpProbe {
  reachable: boolean;
  transport: "streamable-http" | "http+sse" | "unknown";
  sessionId: string | null;
  protocolVersion: string | null;
  serverInfo: { name?: string; version?: string } | null;
  capabilities: Record<string, any> | null;
  initLatencyMs: number | null;
  raw: {
    initialize?: JsonRpcResponse;
    tools?: JsonRpcResponse;
    resources?: JsonRpcResponse;
    prompts?: JsonRpcResponse;
    invalidMethod?: JsonRpcResponse;
    malformed?: { httpStatus: number; body: string };
  };
  httpMeta: {
    initHttpStatus: number | null;
    contentType: string | null;
    wwwAuthenticate: string | null;
    corsAllowOrigin: string | null;
  };
  /** OAuth 2.1 discovery results (PRM + AS metadata). Always attempted for HTTP endpoints. */
  oauth: OAuthDiscovery | null;
  errors: string[];
}

const CLIENT_PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_TIMEOUT_MS = 12000;

function parseSseForJson(text: string): JsonRpcResponse | null {
  // SSE frames: lines beginning with "data:". Concatenate data lines per event.
  const events = text.split(/\n\n+/);
  for (const evt of events) {
    const dataLines = evt
      .split(/\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim());
    if (!dataLines.length) continue;
    const payload = dataLines.join("\n");
    try {
      const obj = JSON.parse(payload);
      if (obj && obj.jsonrpc === "2.0") return obj as JsonRpcResponse;
    } catch {
      /* keep scanning */
    }
  }
  return null;
}

async function readBody(res: Response): Promise<{ json: JsonRpcResponse | null; text: string }> {
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (ct.includes("text/event-stream")) {
    return { json: parseSseForJson(text), text };
  }
  try {
    return { json: JSON.parse(text) as JsonRpcResponse, text };
  } catch {
    // Some servers stream JSON without the SSE content-type; try SSE parse as fallback.
    return { json: parseSseForJson(text), text };
  }
}

async function rpc(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ res: Response; json: JsonRpcResponse | null; text: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await safeFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const parsed = await readBody(res);
    return { res, json: parsed.json, text: parsed.text };
  } finally {
    clearTimeout(t);
  }
}

export async function probeMcpEndpoint(
  url: string,
  userHeaders: Record<string, string> = {},
): Promise<McpProbe> {
  const probe: McpProbe = {
    reachable: false,
    transport: "unknown",
    sessionId: null,
    protocolVersion: null,
    serverInfo: null,
    capabilities: null,
    initLatencyMs: null,
    raw: {},
    httpMeta: {
      initHttpStatus: null,
      contentType: null,
      wwwAuthenticate: null,
      corsAllowOrigin: null,
    },
    oauth: null,
    errors: [],
  };

  try {
    await assertPublicHttpUrl(url);
  } catch (e: any) {
    probe.errors.push(e?.message ?? "URL blocked by safety policy.");
    return probe;
  }

  const baseHeaders: Record<string, string> = { ...sanitizeUserHeaders(userHeaders) };
  const started = Date.now();

  // 1) initialize
  try {
    const init = await rpc(url, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: CLIENT_PROTOCOL_VERSION,
        capabilities: { roots: { listChanged: true }, sampling: {} },
        clientInfo: { name: "mcp-conformance-scanner", version: "0.7.0" },
      },
    }, baseHeaders);

    probe.initLatencyMs = Date.now() - started;
    probe.reachable = true;
    probe.raw.initialize = init.json ?? undefined;
    probe.httpMeta.initHttpStatus = init.res.status;
    probe.httpMeta.contentType = init.res.headers.get("content-type");
    probe.httpMeta.wwwAuthenticate = init.res.headers.get("www-authenticate");
    probe.httpMeta.corsAllowOrigin = init.res.headers.get("access-control-allow-origin");

    const sid = init.res.headers.get("mcp-session-id");
    if (sid) {
      probe.sessionId = sid;
      baseHeaders["mcp-session-id"] = sid;
    }

    const ct = init.res.headers.get("content-type") || "";
    probe.transport = ct.includes("text/event-stream") ? "streamable-http" : "streamable-http";

    if (init.json?.result) {
      probe.protocolVersion = init.json.result.protocolVersion ?? null;
      probe.serverInfo = init.json.result.serverInfo ?? null;
      probe.capabilities = init.json.result.capabilities ?? null;
    } else if (init.res.status === 401 || init.res.status === 403) {
      probe.errors.push(`Server requires authentication (HTTP ${init.res.status}).`);
    } else if (init.json?.error) {
      probe.errors.push(`initialize error ${init.json.error.code}: ${init.json.error.message}`);
    }
  } catch (e: any) {
    probe.errors.push(`Could not reach endpoint: ${e?.message ?? String(e)}`);
    return probe;
  }

  // 2) notifications/initialized (best-effort, no response expected)
  try {
    await rpc(url, { jsonrpc: "2.0", method: "notifications/initialized" }, baseHeaders, 6000);
  } catch {
    /* non-fatal */
  }

  // 3) tools / resources / prompts (only if we got a server capabilities object)
  const caps = probe.capabilities ?? {};
  const listCalls: Array<[keyof McpProbe["raw"], string, boolean]> = [
    ["tools", "tools/list", !!caps.tools || true],
    ["resources", "resources/list", !!caps.resources],
    ["prompts", "prompts/list", !!caps.prompts],
  ];
  let id = 10;
  for (const [key, method, shouldCall] of listCalls) {
    if (!shouldCall) continue;
    try {
      const r = await rpc(url, { jsonrpc: "2.0", id: id++, method, params: {} }, baseHeaders);
      (probe.raw as any)[key] = r.json ?? undefined;
    } catch (e: any) {
      probe.errors.push(`${method} failed: ${e?.message ?? String(e)}`);
    }
  }

  // 4) Error-handling probe: call an unknown method, expect JSON-RPC -32601.
  try {
    const r = await rpc(
      url,
      { jsonrpc: "2.0", id: 999, method: "this/method/does-not-exist", params: {} },
      baseHeaders,
      8000,
    );
    probe.raw.invalidMethod = r.json ?? undefined;
  } catch {
    /* non-fatal */
  }

  // 5) Malformed-JSON probe: expect a graceful HTTP/JSON-RPC error, not a crash.
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6000);
    const res = await safeFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...baseHeaders },
      body: "{ this is not valid json",
      signal: controller.signal,
    });
    clearTimeout(t);
    const body = await res.text();
    probe.raw.malformed = { httpStatus: res.status, body: body.slice(0, 400) };
  } catch {
    /* non-fatal */
  }

  // 6) OAuth 2.1 discovery (PRM → AS metadata). Best-effort; never blocks the rest of the scan.
  try {
    probe.oauth = await discoverOAuth(url, probe.httpMeta.wwwAuthenticate);
    for (const e of probe.oauth.errors) probe.errors.push(`oauth: ${e}`);
  } catch (e: any) {
    probe.errors.push(`OAuth discovery failed: ${e?.message ?? String(e)}`);
  }

  return probe;
}
