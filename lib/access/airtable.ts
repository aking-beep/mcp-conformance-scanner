// Airtable persistence for access-gate leads (durable CRM store).

import type { AccessLead } from "@/lib/access/gate";

export function airtableConfigured(): boolean {
  const token = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  return !!(token && baseId);
}

type FieldMap = Record<string, string | boolean>;

/**
 * Matches the "MCP Sign Up" / Signups table.
 * Always tries the full field set; if Airtable reports UNKNOWN_FIELD_NAME,
 * that field is dropped and the write is retried (so a minimal Full Name /
 * First Name / Last Name / Email table still works).
 */
export async function persistLeadAirtable(
  lead: AccessLead,
): Promise<{ ok: true; recordId: string } | { ok: false; error: string; status?: number }> {
  const token = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_LEADS_TABLE || "Signups";

  if (!token || !baseId) {
    return { ok: false, error: "Airtable is not configured (need AIRTABLE_API_KEY + AIRTABLE_BASE_ID)." };
  }

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
  const fullName = `${lead.firstName} ${lead.lastName}`.trim();

  let fields: FieldMap = {
    "Full Name": lead.company ? `${fullName} · ${lead.company}` : fullName,
    "First Name": lead.firstName,
    "Last Name": lead.lastName,
    Email: lead.email,
    "Lead ID": lead.id,
    Company: lead.company,
    "Company Size": lead.companySize,
    Newsletter: lead.newsletter,
    "Contribute Testing": lead.contributeTesting,
    "Signed Up At": lead.createdAt,
  };

  for (let attempt = 0; attempt < 12; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ typecast: true, fields }),
    });

    const text = await res.text();
    if (res.ok) {
      try {
        const j = JSON.parse(text) as { id?: string };
        return { ok: true, recordId: j.id || "unknown" };
      } catch {
        return { ok: true, recordId: "unknown" };
      }
    }

    let message = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { error?: { message?: string; type?: string } };
      if (j.error?.message) message = j.error.message;
      const unknown = message.match(/Unknown field name: "([^"]+)"/i);
      if (j.error?.type === "UNKNOWN_FIELD_NAME" || unknown) {
        const bad = unknown?.[1];
        if (bad && bad in fields) {
          const next = { ...fields };
          delete next[bad];
          // Keep at least identity fields — if even Email is unknown, fail clearly.
          if (!("Email" in next) && !("First Name" in next)) {
            return { ok: false, error: message, status: res.status };
          }
          fields = next;
          continue;
        }
      }
    } catch {
      /* keep raw */
    }
    return { ok: false, error: message, status: res.status };
  }

  return { ok: false, error: "Airtable rejected the signup after dropping unknown fields." };
}
