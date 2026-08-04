// Optional persisted ScanReports. Nothing is stored unless the user explicitly saves.
// Backends (first match wins):
//   1. Upstash Redis REST — UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
//   2. Filesystem — REPORT_STORE_DIR (default .data/reports in development)
//   3. none — save returns null (email webhook may still fire)

import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { ScanReport } from "@/lib/mcp/types";

export const REPORT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface StoredReport {
  id: string;
  createdAt: string;
  expiresAt: string;
  email?: string;
  report: ScanReport;
}

export type StoreKind = "upstash" | "fs" | "none";

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/$/, "") || "";
}

export function reportPermalink(id: string): string {
  const base = baseUrl();
  return base ? `${base}/r/${id}` : `/r/${id}`;
}

export function activeStoreKind(): StoreKind {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) return "upstash";
  if (process.env.REPORT_STORE_DIR) return "fs";
  if (process.env.NODE_ENV !== "production") return "fs";
  return "none";
}

function fsDir(): string {
  return process.env.REPORT_STORE_DIR || path.join(process.cwd(), ".data", "reports");
}

function newId(): string {
  return "rpt_" + randomBytes(18).toString("hex");
}

function expiresIso(from = new Date()): string {
  return new Date(from.getTime() + REPORT_TTL_SECONDS * 1000).toISOString();
}

async function upstash<T = unknown>(
  ...command: (string | number)[]
): Promise<T | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { result?: T };
  return (data.result ?? null) as T | null;
}

async function saveFs(stored: StoredReport): Promise<void> {
  const dir = fsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${stored.id}.json`), JSON.stringify(stored), "utf8");
}

async function loadFs(id: string): Promise<StoredReport | null> {
  try {
    const raw = await readFile(path.join(fsDir(), `${id}.json`), "utf8");
    return JSON.parse(raw) as StoredReport;
  } catch {
    return null;
  }
}

async function deleteFs(id: string): Promise<void> {
  try {
    await unlink(path.join(fsDir(), `${id}.json`));
  } catch {
    /* ignore */
  }
}

function isExpired(stored: StoredReport): boolean {
  return new Date(stored.expiresAt).getTime() < Date.now();
}

export async function saveReport(
  report: ScanReport,
  email?: string,
): Promise<{ id: string; url: string; store: StoreKind } | null> {
  const kind = activeStoreKind();
  if (kind === "none") return null;

  // Always mint a server-side ID — never trust/reuse client-supplied report ids (overwrite IDOR).
  const id = newId();
  const stored: StoredReport = {
    id,
    createdAt: new Date().toISOString(),
    expiresAt: expiresIso(),
    email: email || undefined,
    report: { ...report, id },
  };

  if (kind === "upstash") {
    const key = `mcp-report:${id}`;
    // NX: do not overwrite an existing key
    const ok = await upstash("SET", key, JSON.stringify(stored), "EX", REPORT_TTL_SECONDS, "NX");
    if (ok === null) return null;
  } else {
    await saveFs(stored);
  }

  return { id, url: reportPermalink(id), store: kind };
}

export async function loadReport(id: string): Promise<StoredReport | null> {
  if (!/^rpt_[a-f0-9]{20,64}$/i.test(id)) return null;

  const kind = activeStoreKind();
  let stored: StoredReport | null = null;

  if (kind === "upstash") {
    const raw = await upstash<string | null>("GET", `mcp-report:${id}`);
    if (typeof raw === "string") {
      try {
        stored = JSON.parse(raw) as StoredReport;
      } catch {
        return null;
      }
    }
  } else if (kind === "fs") {
    stored = await loadFs(id);
  }

  if (!stored) return null;
  if (isExpired(stored)) {
    if (kind === "upstash") await upstash("DEL", `mcp-report:${id}`);
    if (kind === "fs") await deleteFs(id);
    return null;
  }
  return stored;
}

export function storeStatus(): { kind: StoreKind; ttlDays: number } {
  return { kind: activeStoreKind(), ttlDays: REPORT_TTL_SECONDS / (60 * 60 * 24) };
}
