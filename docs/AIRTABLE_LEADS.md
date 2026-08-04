# Airtable leads setup (MCP Conformance Scanner)

## Why Airtable
Production signups on Vercel do **not** keep a durable file. Airtable is the CRM table
where first name, last name, email, company, size, newsletter, and testing opt-in live.

## 1. Accept your base invite / open the base
Use your Airtable invite email (do **not** paste invite tokens into git or public chats).

## 2. Create a table named `Leads` with these fields

| Field name           | Type            | Notes                                      |
|----------------------|-----------------|--------------------------------------------|
| Lead ID              | Single line text|                                            |
| First Name           | Single line text|                                            |
| Last Name            | Single line text|                                            |
| Email                | Email           |                                            |
| Company              | Single line text|                                            |
| Company Size         | Single select   | Options: `solo`, `small`, `mid`, `enterprise` |
| Newsletter           | Checkbox        |                                            |
| Contribute Testing   | Checkbox        |                                            |
| Signed Up At         | Single line text| ISO timestamp from the app                 |

Exact names matter (or change `AIRTABLE_LEADS_TABLE` / field map in code).

## 3. Create a Personal Access Token
https://airtable.com/create/tokens

- Scopes: `data.records:write` (and `data.records:read` if you want)
- Access: add **this base**
- Copy the full `pat…` token once (you won’t see the secret again)

## 4. Find the Base ID
Open the base → URL looks like `https://airtable.com/appXXXXXXXXXXXXXX/...`
The `app…` segment is `AIRTABLE_BASE_ID`.

## 5. Set Vercel env vars (Production + Preview)
```
AIRTABLE_API_KEY=pat...
AIRTABLE_BASE_ID=app...
AIRTABLE_LEADS_TABLE=Leads
ACCESS_GATE_SECRET=<long random string>
NEXT_PUBLIC_BASE_URL=https://mcp-conformance-scanner.vercel.app
```

Redeploy after saving env vars.

## 6. Verify
Submit the pre-scan form on the live site → a new row should appear in **Leads**.
If Airtable is configured and the write fails, signup errors (so we don’t unlock without saving).
