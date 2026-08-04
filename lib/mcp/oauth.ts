// OAuth 2.1 discovery for MCP HTTP servers.
// Follows MCP authorization (RFC 9728 PRM → RFC 8414 / OIDC AS metadata),
// checking PKCE (S256) and refresh_token support without performing a full login.

import { safeFetch } from "@/lib/security/ssrf";

export interface ProtectedResourceMetadata {
  resource?: string;
  authorization_servers?: string[];
  bearer_methods_supported?: string[];
  scopes_supported?: string[];
  resource_documentation?: string;
  [key: string]: unknown;
}

export interface AuthorizationServerMetadata {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  registration_endpoint?: string;
  revocation_endpoint?: string;
  introspection_endpoint?: string;
  jwks_uri?: string;
  grant_types_supported?: string[];
  response_types_supported?: string[];
  code_challenge_methods_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  scopes_supported?: string[];
  [key: string]: unknown;
}

export interface OAuthDiscovery {
  attempted: boolean;
  /** Parsed resource_metadata URL from WWW-Authenticate, if any. */
  resourceMetadataUrl: string | null;
  /** How PRM was found. */
  prmSource: "www-authenticate" | "well-known-path" | "well-known-root" | null;
  prm: ProtectedResourceMetadata | null;
  prmUrl: string | null;
  /** First authorization server issuer selected from PRM. */
  authorizationServer: string | null;
  asMetadata: AuthorizationServerMetadata | null;
  asMetadataUrl: string | null;
  asMetadataSource: "oauth-authorization-server" | "openid-configuration" | null;
  errors: string[];
}

const FETCH_MS = 8000;

async function getJson(url: string): Promise<{ ok: boolean; status: number; json: any | null }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const res = await safeFetch(url, {
      method: "GET",
      headers: { accept: "application/json", "user-agent": "mcp-conformance-scanner" },
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, status: res.status, json: null };
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    // Cap body size to avoid memory abuse from huge metadata docs
    if (text.length > 512_000) return { ok: false, status: res.status, json: null };
    try {
      return { ok: true, status: res.status, json: JSON.parse(text) };
    } catch {
      if (ct.includes("json") || text.trim().startsWith("{")) {
        try {
          return { ok: true, status: res.status, json: JSON.parse(text) };
        } catch {
          return { ok: false, status: res.status, json: null };
        }
      }
      return { ok: false, status: res.status, json: null };
    }
  } catch {
    return { ok: false, status: 0, json: null };
  } finally {
    clearTimeout(t);
  }
}

/** Extract resource_metadata="..." from a WWW-Authenticate header value. */
export function parseResourceMetadataUrl(wwwAuthenticate: string | null | undefined): string | null {
  if (!wwwAuthenticate) return null;
  const m =
    wwwAuthenticate.match(/resource_metadata\s*=\s*"([^"]+)"/i) ||
    wwwAuthenticate.match(/resource_metadata\s*=\s*([^\s,]+)/i);
  return m?.[1] ?? null;
}

function originOf(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

/** Build RFC 9728 well-known candidates for an MCP endpoint URL. */
export function protectedResourceWellKnownUrls(mcpUrl: string): string[] {
  const u = new URL(mcpUrl);
  const origin = originOf(mcpUrl);
  const path = u.pathname.replace(/\/+$/, "") || "";
  const urls: string[] = [];
  if (path && path !== "/") {
    // Path insertion: /.well-known/oauth-protected-resource{path}
    urls.push(`${origin}/.well-known/oauth-protected-resource${path}`);
  }
  urls.push(`${origin}/.well-known/oauth-protected-resource`);
  return urls;
}

/** Build AS metadata discovery URLs for an issuer (RFC 8414 + OIDC). */
export function authorizationServerMetadataUrls(issuer: string): Array<{
  url: string;
  source: "oauth-authorization-server" | "openid-configuration";
}> {
  const cleaned = issuer.replace(/\/+$/, "");
  const u = new URL(cleaned.includes("://") ? cleaned : `https://${cleaned}`);
  const origin = `${u.protocol}//${u.host}`;
  const path = u.pathname.replace(/\/+$/, "");
  const out: Array<{ url: string; source: "oauth-authorization-server" | "openid-configuration" }> = [];

  if (path && path !== "/") {
    out.push({
      url: `${origin}/.well-known/oauth-authorization-server${path}`,
      source: "oauth-authorization-server",
    });
    out.push({
      url: `${origin}/.well-known/openid-configuration${path}`,
      source: "openid-configuration",
    });
    out.push({
      url: `${cleaned}/.well-known/openid-configuration`,
      source: "openid-configuration",
    });
  } else {
    out.push({
      url: `${origin}/.well-known/oauth-authorization-server`,
      source: "oauth-authorization-server",
    });
    out.push({
      url: `${origin}/.well-known/openid-configuration`,
      source: "openid-configuration",
    });
  }
  return out;
}

function emptyDiscovery(): OAuthDiscovery {
  return {
    attempted: false,
    resourceMetadataUrl: null,
    prmSource: null,
    prm: null,
    prmUrl: null,
    authorizationServer: null,
    asMetadata: null,
    asMetadataUrl: null,
    asMetadataSource: null,
    errors: [],
  };
}

/**
 * Discover OAuth Protected Resource Metadata and Authorization Server Metadata
 * for an MCP HTTP endpoint. Safe to call for public servers (records misses).
 */
export async function discoverOAuth(
  mcpUrl: string,
  wwwAuthenticate?: string | null,
): Promise<OAuthDiscovery> {
  const discovery = emptyDiscovery();
  discovery.attempted = true;

  try {
    new URL(mcpUrl);
  } catch {
    discovery.errors.push("Invalid MCP URL for OAuth discovery.");
    return discovery;
  }

  const headerUrl = parseResourceMetadataUrl(wwwAuthenticate ?? null);
  discovery.resourceMetadataUrl = headerUrl;

  // 1) PRM via WWW-Authenticate pointer
  if (headerUrl) {
    const r = await getJson(headerUrl);
    if (r.ok && r.json && typeof r.json === "object") {
      discovery.prm = r.json as ProtectedResourceMetadata;
      discovery.prmUrl = headerUrl;
      discovery.prmSource = "www-authenticate";
    } else {
      discovery.errors.push(
        `resource_metadata URL from WWW-Authenticate returned HTTP ${r.status || "error"}.`,
      );
    }
  }

  // 2) Well-known fallback
  if (!discovery.prm) {
    const candidates = protectedResourceWellKnownUrls(mcpUrl);
    for (const url of candidates) {
      const r = await getJson(url);
      if (r.ok && r.json && typeof r.json === "object") {
        discovery.prm = r.json as ProtectedResourceMetadata;
        discovery.prmUrl = url;
        const after = url.split("/.well-known/oauth-protected-resource")[1] ?? "";
        discovery.prmSource = after && after !== "/" ? "well-known-path" : "well-known-root";
        break;
      }
    }
  }

  if (!discovery.prm) {
    return discovery;
  }

  const servers = Array.isArray(discovery.prm.authorization_servers)
    ? discovery.prm.authorization_servers.filter((s) => typeof s === "string" && s.length > 0)
    : [];
  if (!servers.length) {
    discovery.errors.push("Protected Resource Metadata is missing authorization_servers.");
    return discovery;
  }

  discovery.authorizationServer = servers[0];

  // 3) Authorization Server metadata
  for (const candidate of authorizationServerMetadataUrls(servers[0])) {
    const r = await getJson(candidate.url);
    if (r.ok && r.json && typeof r.json === "object") {
      discovery.asMetadata = r.json as AuthorizationServerMetadata;
      discovery.asMetadataUrl = candidate.url;
      discovery.asMetadataSource = candidate.source;
      break;
    }
  }

  if (!discovery.asMetadata) {
    discovery.errors.push(
      `Could not fetch Authorization Server metadata for issuer ${servers[0]}.`,
    );
  }

  return discovery;
}

export function asSupportsRefresh(meta: AuthorizationServerMetadata | null): boolean {
  if (!meta) return false;
  const grants = meta.grant_types_supported;
  if (Array.isArray(grants) && grants.map(String).includes("refresh_token")) return true;
  // Some servers omit grant_types_supported but still issue refresh tokens;
  // presence of token_endpoint alone is insufficient — require explicit signal.
  return false;
}

export function asSupportsPkceS256(meta: AuthorizationServerMetadata | null): boolean {
  if (!meta) return false;
  const methods = meta.code_challenge_methods_supported;
  if (!Array.isArray(methods) || !methods.length) return false;
  return methods.map(String).includes("S256");
}
