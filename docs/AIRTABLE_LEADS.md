# Airtable leads setup (MCP Conformance Scanner)

## Why Airtable
Production signups on Vercel do **not** keep a durable file. Airtable is the CRM table
where first name, last name, email, company, size, newsletter, and testing opt-in live.

## 1. Accept your base invite / open the base
Use your Airtable invite email (do **not** paste invite tokens into git or public chats).

## 2. Use your `Signups` table (MCP Sign Up base)

**Minimum** (already present): Full Name, First Name, Last Name, Email.

The app writes optional fields when they exist; unknown columns are dropped automatically.
Company is also appended onto Full Name (`Name · Company`) so it isn’t lost on a minimal table.

Optional columns (exact names):

| Field name           | Type            | Notes                                      |
|----------------------|-----------------|--------------------------------------------|
| Lead ID              | Single line text|                                            |
| Company              | Single line text|                                            |
| Company Size         | Single select   | Options: `solo`, `small`, `mid`, `enterprise` |
| Newsletter           | Checkbox        |                                            |
| Contribute Testing   | Checkbox        |                                            |
| Signed Up At         | Single line text| ISO timestamp from the app                 |

Default table is `Signups` (or set `AIRTABLE_LEADS_TABLE` to the table id).

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
AIRTABLE_LEADS_TABLE=Signups
ACCESS_GATE_SECRET=<long random string>
NEXT_PUBLIC_BASE_URL=https://mcp-conformance-scanner.vercel.app
```

Redeploy after saving env vars.

## 6. Verify
Submit the pre-scan form on the live site → a new row should appear in **Leads**.
If Airtable is configured and the write fails, signup errors (so we don’t unlock without saving).
