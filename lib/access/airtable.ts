// Airtable persistence for access-gate leads (durable CRM store).

import type { AccessLead } from "@/lib/access/gate";

export function airtableConfigured(): boolean {
  const token = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  return !!(token && baseId);
}

/**
 * Matches the "MCP Sign Up" base / "Signups" table.
 * Required columns (exact names):
 *   Full Name, First Name, Last Name, Email
 * Recommended (app sends these — add the columns or writes will fail):
 *   Lead ID, Company, Company Size (solo|small|mid|enterprise),
 *   Newsletter, Contribute Testing, Signed Up At
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
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      typecast: true,
      fields: {
        "Full Name": fullName,
        "First Name": lead.firstName,
        "Last Name": lead.lastName,
        Email: lead.email,
        "Lead ID": lead.id,
        Company: lead.company,
        "Company Size": lead.companySize,
        Newsletter: lead.newsletter,
        "Contribute Testing": lead.contributeTesting,
        "Signed Up At": lead.createdAt,
      },
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { error?: { message?: string } };
      if (j.error?.message) message = j.error.message;
    } catch {
      /* keep raw */
    }
    return { ok: false, error: message, status: res.status };
  }

  try {
    const j = JSON.parse(text) as { id?: string };
    return { ok: true, recordId: j.id || "unknown" };
  } catch {
    return { ok: true, recordId: "unknown" };
  }
}
