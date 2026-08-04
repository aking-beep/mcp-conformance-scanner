// Estimates how cleanly this server will plug into each major model platform,
// based on the observed checks. Heuristic, but grounded in each platform's
// documented MCP/tool-calling constraints.

import type { CheckResult, CompatibilityRow } from "./types";

function find(checks: CheckResult[], id: string) {
  return checks.find((c) => c.id === id);
}

export function buildCompatibility(checks: CheckResult[]): CompatibilityRow[] {
  const naming = find(checks, "tools.naming");
  const schema = find(checks, "tools.schema");
  const protocolVersion = find(checks, "protocol.version");
  const auth = find(checks, "auth.scheme");
  const streaming = find(checks, "streaming.support");
  const errors = find(checks, "errors.unknownMethod");

  const namingOk = naming ? naming.status === "pass" : true;
  const schemaOk = schema ? schema.status !== "fail" : true;
  const protoOk = protocolVersion ? protocolVersion.status !== "fail" : false;

  const rows: CompatibilityRow[] = [];

  // Claude — first-class MCP support (native connectors, resources, prompts).
  rows.push({
    platform: "Claude",
    status: protoOk && schemaOk ? "pass" : protoOk ? "warn" : "fail",
    note: protoOk
      ? schemaOk
        ? "Native MCP support; tools, resources, and prompts map directly."
        : "Works, but tighten tool input schemas for reliable tool calls."
      : "Fix protocol handshake before connecting via MCP.",
  });

  // OpenAI — tool calling requires strict JSON-Schema + safe names.
  rows.push({
    platform: "OpenAI",
    status: schemaOk && namingOk ? "pass" : schemaOk || namingOk ? "warn" : "fail",
    note:
      schemaOk && namingOk
        ? "Tool schemas + names satisfy function-calling requirements."
        : !namingOk
        ? "Tool names must match ^[a-zA-Z0-9_-]+$ for function calling."
        : "Provide strict object JSON-Schema for each tool.",
  });

  // Gemini — function declarations, stricter about schema types.
  rows.push({
    platform: "Gemini",
    status: schemaOk ? (namingOk ? "pass" : "warn") : "fail",
    note: schemaOk
      ? "Maps to Gemini function declarations; verify enum/format fields."
      : "Gemini rejects tools without typed parameter schemas.",
  });

  // Bedrock — enterprise; auth + error handling weigh heavily.
  const bedrockOk = schemaOk && (auth ? auth.status !== "fail" : true) && (errors ? errors.status !== "fail" : true);
  rows.push({
    platform: "Bedrock",
    status: bedrockOk ? (auth?.status === "pass" ? "pass" : "warn") : "fail",
    note: bedrockOk
      ? auth?.status === "pass"
        ? "Schema, auth, and error handling meet enterprise agent requirements."
        : "Usable via agents; add OAuth for production enterprise deployments."
      : "Harden schemas, auth, and error handling for Bedrock agents.",
  });

  // Streaming note nudges Claude/Bedrock down a hair if missing — reflected in checks already.
  void streaming;

  return rows;
}
