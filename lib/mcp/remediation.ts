// Remediation copy for actionable recommendations (issue / why / fix / reference).

const SPEC = "https://modelcontextprotocol.io/specification/2025-03-26";
const AUTH = "https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization";
const TRANSPORT = "https://modelcontextprotocol.io/specification/2025-03-26/basic/transports";
const TOOLS = "https://modelcontextprotocol.io/specification/2025-03-26/server/tools";
const RESOURCES = "https://modelcontextprotocol.io/specification/2025-03-26/server/resources";
const PROMPTS = "https://modelcontextprotocol.io/specification/2025-03-26/server/prompts";
const PRM = "https://datatracker.ietf.org/doc/html/rfc9728";
const OAUTH_AS = "https://datatracker.ietf.org/doc/html/rfc8414";
const PKCE = "https://datatracker.ietf.org/doc/html/rfc7636";

export interface RemediationHint {
  why: string;
  fix: string;
  reference: string;
}

/** Per-check defaults when a CheckResult omits fix / why / reference. */
export const REMEDIATION: Record<string, RemediationHint> = {
  "protocol.reachable": {
    why: "Clients cannot discover tools or complete the handshake if the transport endpoint is unreachable.",
    fix: "Confirm the server is running and the URL points at the MCP transport endpoint (often `/mcp`).",
    reference: TRANSPORT,
  },
  "protocol.version": {
    why: "Clients negotiate behavior from `protocolVersion`. An missing or stale revision breaks feature detection.",
    fix: "Return a known `protocolVersion` in the initialize result and prefer the latest MCP revision.",
    reference: `${SPEC}/basic/lifecycle`,
  },
  "protocol.serverInfo": {
    why: "Operators and clients use serverInfo to identify which binary they are talking to during support and audits.",
    fix: "Populate `serverInfo.name` and `serverInfo.version` in the initialize result.",
    reference: `${SPEC}/basic/lifecycle`,
  },
  "protocol.capabilities": {
    why: "Without capabilities, clients cannot know whether tools, resources, or prompts are available.",
    fix: "Advertise the capabilities your server supports (`tools`, `resources`, `prompts`, etc.).",
    reference: `${SPEC}/basic/lifecycle`,
  },
  "tools.list": {
    why: "Most MCP clients call `tools/list` immediately after initialize; failures block agent workflows.",
    fix: "Implement `tools/list` and return a `tools` array (empty is fine if you advertise no tools).",
    reference: TOOLS,
  },
  "tools.naming": {
    why: "Non-standard tool names break SDK helpers and registry listings that assume `[a-zA-Z][a-zA-Z0-9_-]*`.",
    fix: "Rename tools to start with a letter and use only letters, digits, `_`, and `-` (max 64 chars).",
    reference: TOOLS,
  },
  "tools.schema": {
    why: "Clients validate and render forms from each tool’s `inputSchema`. Missing schemas cause invalid or unsafe calls.",
    fix: "Add a JSON Schema (`type: object` with `properties`) describing each tool’s expected input parameters.",
    reference: TOOLS,
  },
  "tools.descriptions": {
    why: "Models pick tools from descriptions. Empty copy leads to wrong tool selection.",
    fix: "Give every tool a concise, action-oriented `description`.",
    reference: TOOLS,
  },
  "resources.list": {
    why: "If resources are advertised, `resources/list` must succeed or clients cannot browse context.",
    fix: "Implement `resources/list` or stop advertising the resources capability.",
    reference: RESOURCES,
  },
  "resources.uris": {
    why: "Malformed URIs break resource fetchers and cache keys in host applications.",
    fix: "Use absolute URIs with a clear scheme (e.g. `file://`, `https://`, or a custom scheme).",
    reference: RESOURCES,
  },
  "prompts.list": {
    why: "Prompt templates are loaded via `prompts/list`; failures hide curated workflows from users.",
    fix: "Implement `prompts/list` or remove the prompts capability.",
    reference: PROMPTS,
  },
  "prompts.valid": {
    why: "Invalid prompt definitions cause host UIs to skip or crash when rendering arguments.",
    fix: "Ensure each prompt has a name and well-formed `arguments` (name + required flag).",
    reference: PROMPTS,
  },
  "errors.unknownMethod": {
    why: "JSON-RPC clients expect a structured error for unknown methods, not a hang or HTTP 500.",
    fix: "Return a JSON-RPC error with code `-32601` (Method not found) for unknown methods.",
    reference: "https://www.jsonrpc.org/specification#error_object",
  },
  "errors.malformed": {
    why: "Malformed bodies are common from buggy clients; crashing the process is a DoS risk.",
    fix: "Return JSON-RPC `-32700` / `-32600` for parse and invalid-request errors without throwing uncaught.",
    reference: "https://www.jsonrpc.org/specification#error_object",
  },
  "auth.required": {
    why: "Unauthenticated remote MCP servers expose tools and data to anyone who can reach the URL.",
    fix: "Require bearer/OAuth on production endpoints, or clearly document that the server is intentionally public.",
    reference: AUTH,
  },
  "auth.scheme": {
    why: "Clients need to know how to obtain tokens; silent 401s without a scheme stall integration.",
    fix: "Advertise OAuth 2.1 (or Bearer) via WWW-Authenticate / Protected Resource Metadata.",
    reference: AUTH,
  },
  "auth.prm": {
    why: "RFC 9728 Protected Resource Metadata is how MCP clients discover the authorization server.",
    fix: "Publish PRM (e.g. `/.well-known/oauth-protected-resource`) and reference it from 401 responses.",
    reference: PRM,
  },
  "auth.prm.servers": {
    why: "Without `authorization_servers`, clients cannot locate the AS that issues tokens for this resource.",
    fix: "Include at least one `authorization_servers` entry in Protected Resource Metadata.",
    reference: PRM,
  },
  "auth.asMetadata": {
    why: "AS metadata tells clients the authorize/token endpoints and supported grants.",
    fix: "Serve RFC 8414 Authorization Server Metadata from the advertised AS.",
    reference: OAUTH_AS,
  },
  "auth.tokenEndpoint": {
    why: "Token and authorize endpoints are required to complete the OAuth code flow.",
    fix: "Advertise both `authorization_endpoint` and `token_endpoint` in AS metadata.",
    reference: OAUTH_AS,
  },
  "auth.pkce": {
    why: "PKCE (S256) prevents authorization-code interception for public MCP clients.",
    fix: "Include `S256` in `code_challenge_methods_supported` on the authorization server.",
    reference: PKCE,
  },
  "auth.refresh": {
    why: "Without refresh tokens, long-running agents must re-login whenever access tokens expire.",
    fix: "Support the `refresh_token` grant and return refresh tokens where appropriate.",
    reference: AUTH,
  },
  "auth.dcr": {
    why: "Dynamic Client Registration lets hosts onboard without a manual client-id exchange.",
    fix: "Advertise a `registration_endpoint` if you want zero-touch client setup.",
    reference: "https://datatracker.ietf.org/doc/html/rfc7591",
  },
  "streaming.support": {
    why: "Long tool calls need progress events; without SSE, UIs look hung and timeouts fire.",
    fix: "Support Streamable HTTP with `text/event-stream` (or document a short-lived tools-only server).",
    reference: TRANSPORT,
  },
  "security.tls": {
    why: "Cleartext MCP traffic exposes tokens and tool arguments to network observers.",
    fix: "Serve the MCP endpoint exclusively over HTTPS in production.",
    reference: AUTH,
  },
  "security.cors": {
    why: "Over-permissive CORS lets arbitrary websites invoke your MCP tools from a victim’s browser.",
    fix: "Restrict `Access-Control-Allow-Origin` to known hosts; avoid reflecting `*` with credentials.",
    reference: "https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS",
  },
  "security.injection": {
    why: "Untrusted tool output echoed into model context enables prompt-injection attacks.",
    fix: "Treat tool/resource content as untrusted; sandbox and delimit untrusted text in prompts.",
    reference: "https://modelcontextprotocol.io/docs/concepts/security",
  },
  "security.destructive": {
    why: "Destructive tools without confirmations can delete data when an agent mis-fires a call.",
    fix: "Require explicit confirmation, dry-run flags, or scoped auth for delete/write tools.",
    reference: "https://modelcontextprotocol.io/docs/concepts/security",
  },
  "docs.toolDocs": {
    why: "Undocumented tools are hard for humans and models to use safely.",
    fix: "Add descriptions (and argument docs) for every tool.",
    reference: TOOLS,
  },
  "docs.serverIdentity": {
    why: "Anonymous servers are harder to trust, cite, and support.",
    fix: "Set a stable `serverInfo.name` (and version) so reports and badges identify you.",
    reference: `${SPEC}/basic/lifecycle`,
  },
};

const CATEGORY_DEFAULTS: Record<string, RemediationHint> = {
  protocol: {
    why: "Protocol gaps break client compatibility across hosts.",
    fix: "Align the initialize handshake and advertised capabilities with the MCP specification.",
    reference: SPEC,
  },
  tools: {
    why: "Tool definition problems cause failed or unsafe invocations from LLM hosts.",
    fix: "Ensure every tool has a stable name, description, and JSON Schema input.",
    reference: TOOLS,
  },
  resources: {
    why: "Resource listing/URI issues prevent hosts from loading context correctly.",
    fix: "Return well-formed resource descriptors from `resources/list`.",
    reference: RESOURCES,
  },
  prompts: {
    why: "Broken prompt definitions hide curated workflows from users.",
    fix: "Validate prompt names and argument metadata against the MCP prompts schema.",
    reference: PROMPTS,
  },
  errors: {
    why: "Poor error handling turns client bugs into server outages.",
    fix: "Return structured JSON-RPC errors for unknown methods and malformed input.",
    reference: "https://www.jsonrpc.org/specification#error_object",
  },
  auth: {
    why: "Weak auth puts tools and private data at risk on the public internet.",
    fix: "Adopt OAuth 2.1 with Protected Resource Metadata for remote MCP servers.",
    reference: AUTH,
  },
  streaming: {
    why: "Missing streaming support degrades UX for long-running tools.",
    fix: "Implement Streamable HTTP / SSE progress notifications.",
    reference: TRANSPORT,
  },
  security: {
    why: "Security findings are the highest-impact issues for production MCP deployments.",
    fix: "Enforce TLS, tighten CORS, and treat model-facing content as untrusted.",
    reference: "https://modelcontextprotocol.io/docs/concepts/security",
  },
  docs: {
    why: "Thin docs slow adoption and increase misuse.",
    fix: "Document tools and identify the server clearly in initialize.",
    reference: SPEC,
  },
};

export function remediationFor(
  checkId: string,
  category: string,
  detail: string,
  fix?: string,
): RemediationHint {
  const known = REMEDIATION[checkId] ?? CATEGORY_DEFAULTS[category] ?? {
    why: "This finding affects MCP conformance or operational readiness.",
    fix: "Address the reported issue and re-scan.",
    reference: SPEC,
  };
  return {
    why: known.why,
    fix: fix?.trim() || known.fix,
    reference: known.reference,
  };
}
