// Pre-scan access gate: collect lead info, mint a signed access token.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { airtableConfigured, persistLeadAirtable } from "@/lib/access/airtable";

export interface AccessLead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  companySize: "solo" | "small" | "mid" | "enterprise";
  newsletter: boolean;
  contributeTesting: boolean;
  createdAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const ACCESS_TTL_MS = 30 * DAY_MS;

function secret(): string {
  const s = process.env.ACCESS_GATE_SECRET?.trim();
  if (s) return s;
  // Never mint/verify with a public fallback on Vercel / production.
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new Error("ACCESS_GATE_SECRET must be set in production.");
  }
  return "dev-only-access-gate-secret-change-me";
}

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString("base64url");
}

export function accessGateEnabled(): boolean {
  // On by default: unlock reports after a one-time signup when the user hits Scan.
  const v = (process.env.ACCESS_GATE_ENABLED ?? "true").toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

export function mintAccessToken(leadId: string, email: string): string {
  const payload = b64url(
    JSON.stringify({
      lid: leadId,
      email: email.toLowerCase(),
      exp: Date.now() + ACCESS_TTL_MS,
    }),
  );
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyAccessToken(token: string | null | undefined): { ok: true; leadId: string; email: string } | { ok: false; error: string } {
  if (!token) return { ok: false, error: "Access token required." };
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, error: "Invalid access token." };
  const [payload, sig] = parts;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, error: "Invalid access token." };
    }
  } catch {
    return { ok: false, error: "Invalid access token." };
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      lid?: string;
      email?: string;
      exp?: number;
    };
    if (!data.lid || !data.email || !data.exp) return { ok: false, error: "Invalid access token." };
    if (Date.now() > data.exp) return { ok: false, error: "Access token expired — please sign in again." };
    return { ok: true, leadId: data.lid, email: data.email };
  } catch {
    return { ok: false, error: "Invalid access token." };
  }
}

function leadsDir(): string {
  return process.env.LEADS_STORE_DIR || path.join(process.cwd(), ".data", "leads");
}

async function persistLeadLocal(lead: AccessLead): Promise<void> {
  const dir = leadsDir();
  await mkdir(dir, { recursive: true });
  await appendFile(path.join(dir, "leads.jsonl"), JSON.stringify(lead) + "\n", "utf8");
}

async function persistLeadUpstash(lead: AccessLead): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(["SET", `mcp-lead:${lead.id}`, JSON.stringify(lead)]),
  });
  await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(["LPUSH", "mcp-leads", lead.id]),
  });
}

export async function saveLead(lead: Omit<AccessLead, "id" | "createdAt">): Promise<AccessLead & { airtableRecordId?: string }> {
  const full: AccessLead & { airtableRecordId?: string } = {
    ...lead,
    id: "lead_" + randomBytes(12).toString("hex"),
    email: lead.email.trim().toLowerCase(),
    createdAt: new Date().toISOString(),
  };

  // Airtable is the durable CRM store. If configured, require a successful write
  // so we never unlock scanning without saving the lead.
  if (airtableConfigured()) {
    const result = await persistLeadAirtable(full);
    if (!result.ok) {
      throw new Error(`Could not save your signup to Airtable: ${result.error}`);
    }
    full.airtableRecordId = result.recordId;
  }

  try {
    await persistLeadUpstash(full);
  } catch {
    /* best-effort backup */
  }
  try {
    await persistLeadLocal(full);
  } catch {
    /* best-effort in serverless */
  }

  const webhook = process.env.LEAD_WEBHOOK_URL || process.env.EMAIL_CAPTURE_WEBHOOK_URL;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "access_lead", ...full }),
      });
    } catch {
      /* never fail signup on secondary webhook */
    }
  }

  return full;
}

export function extractAccessToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const hdr = req.headers.get("x-mcp-access-token");
  if (hdr) return hdr.trim();
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)mcp_access=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Dev helper — not used in prod paths. */
export async function countLocalLeads(): Promise<number> {
  try {
    const raw = await readFile(path.join(leadsDir(), "leads.jsonl"), "utf8");
    return raw.split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}
