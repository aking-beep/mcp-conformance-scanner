// Outbound URL safety for scan / OAuth / badge fetches (SSRF hardening).

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 3;
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google.internal.",
]);

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

function isPrivateOrReservedIp(ip: string): boolean {
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("::ffff:")) {
      const v4 = lower.slice("::ffff:".length);
      if (isIP(v4) === 4) return isPrivateOrReservedIp(v4);
    }
    // IPv4-mapped without normalizing further — treat unique-local / link-local above
    return false;
  }

  const n = ipv4ToInt(ip);
  const ranges: Array<[number, number]> = [
    [ipv4ToInt("0.0.0.0"), ipv4ToInt("0.255.255.255")],
    [ipv4ToInt("10.0.0.0"), ipv4ToInt("10.255.255.255")],
    [ipv4ToInt("100.64.0.0"), ipv4ToInt("100.127.255.255")], // CGNAT
    [ipv4ToInt("127.0.0.0"), ipv4ToInt("127.255.255.255")],
    [ipv4ToInt("169.254.0.0"), ipv4ToInt("169.254.255.255")], // link-local / metadata
    [ipv4ToInt("172.16.0.0"), ipv4ToInt("172.31.255.255")],
    [ipv4ToInt("192.0.0.0"), ipv4ToInt("192.0.0.255")],
    [ipv4ToInt("192.168.0.0"), ipv4ToInt("192.168.255.255")],
    [ipv4ToInt("198.18.0.0"), ipv4ToInt("198.19.255.255")],
    [ipv4ToInt("224.0.0.0"), ipv4ToInt("255.255.255.255")], // multicast + broadcast
  ];
  return ranges.some(([a, b]) => n >= a && n <= b);
}

function hostnameBlocked(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "0.0.0.0") return true;
  return false;
}

/** Resolve host and reject private / reserved addresses (DNS rebinding resistant at check time). */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new Error("URLs with embedded credentials are not allowed.");
  }
  if (hostnameBlocked(url.hostname)) {
    throw new Error("That hostname is not allowed.");
  }

  const host = url.hostname;
  if (isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error("Private or reserved IP addresses are not allowed.");
    }
    return url;
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error(`Could not resolve hostname "${host}".`);
  }
  if (!records.length) throw new Error(`Could not resolve hostname "${host}".`);
  for (const r of records) {
    if (isPrivateOrReservedIp(r.address)) {
      throw new Error("Hostname resolves to a private or reserved address.");
    }
  }
  return url;
}

const ALLOWED_REQUEST_HEADERS = new Set([
  "authorization",
  "mcp-session-id",
  "x-api-key",
  "api-key",
]);

/** Allow only a small allowlist of caller-supplied headers for MCP probes. */
export function sanitizeUserHeaders(
  headers?: Record<string, string>,
): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase().trim();
    if (!ALLOWED_REQUEST_HEADERS.has(key)) continue;
    if (typeof v !== "string" || v.length > 4096) continue;
    out[key] = v;
  }
  return out;
}

/**
 * fetch() that re-validates every redirect hop against SSRF rules.
 * Does not follow more than MAX_REDIRECTS hops.
 */
export async function safeFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  let current = await assertPublicHttpUrl(input);
  const method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers);
  const body = init.body;
  const signal = init.signal;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current.toString(), {
      method,
      headers,
      body: hop === 0 ? body : method === "GET" || method === "HEAD" ? undefined : body,
      signal,
      redirect: "manual",
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      const next = new URL(loc, current);
      current = await assertPublicHttpUrl(next.toString());
      // After redirect, use GET for 303; keep method for 307/308 when possible
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method !== "GET" && method !== "HEAD")) {
        // Collapse to GET without body for common POST→redirect patterns
        return safeFetchGet(current.toString(), headers, signal, MAX_REDIRECTS - hop - 1);
      }
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects.");
}

async function safeFetchGet(
  url: string,
  headers: Headers,
  signal: AbortSignal | null | undefined,
  remaining: number,
): Promise<Response> {
  let current = await assertPublicHttpUrl(url);
  for (let hop = 0; hop <= remaining; hop++) {
    const res = await fetch(current.toString(), {
      method: "GET",
      headers,
      signal: signal ?? undefined,
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      current = await assertPublicHttpUrl(new URL(loc, current).toString());
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects.");
}
