/**
 * Streamable HTTP helpers for MCP 2026-07-28 (SEP-2243 header routing).
 * Validates Mcp-Method / Mcp-Name against the JSON-RPC body before Cedar evaluation.
 */

export const MCP_PROTOCOL_2026 = '2026-07-28';
export const MCP_PROTOCOL_2025 = '2025-11-25';
export const MCP_PROTOCOL_LEGACY = '2024-11-05';

const NAMED_METHODS = new Set([
  'tools/call',
  'resources/read',
  'resources/subscribe',
  'resources/unsubscribe',
  'prompts/get',
]);

export type McpHttpValidationResult =
  | { ok: true; method: string; name?: string; protocolVersion: string }
  | { ok: false; status: number; error: string; code: number };

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const lower = name.toLowerCase();
  const raw = headers[lower] ?? headers[name];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === 'string' ? raw : undefined;
}

/**
 * Reject Streamable HTTP requests where routing headers disagree with the body
 * (protocol-confusion / desync class called out for MCP 2026-07-28).
 */
export function validateMcpStreamableHeaders(
  headers: Record<string, string | string[] | undefined>,
  body: unknown
): McpHttpValidationResult {
  const protocolVersion = headerValue(headers, 'mcp-protocol-version');
  const mcpMethod = headerValue(headers, 'mcp-method');
  const mcpName = headerValue(headers, 'mcp-name');

  if (!protocolVersion || !protocolVersion.trim()) {
    return {
      ok: false,
      status: 400,
      error: 'Missing required header: MCP-Protocol-Version',
      code: -32600,
    };
  }

  if (!mcpMethod || !mcpMethod.trim()) {
    return {
      ok: false,
      status: 400,
      error: 'Missing required header: Mcp-Method',
      code: -32600,
    };
  }

  const req = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const bodyMethod = typeof req?.method === 'string' ? req.method : undefined;

  if (bodyMethod && mcpMethod !== bodyMethod) {
    return {
      ok: false,
      status: 400,
      error: 'Mcp-Method header/body disagreement',
      code: -32600,
    };
  }

  const effectiveMethod = bodyMethod || mcpMethod;
  const params =
    req?.params && typeof req.params === 'object'
      ? (req.params as Record<string, unknown>)
      : undefined;
  const bodyName = typeof params?.name === 'string' ? params.name : undefined;

  if (NAMED_METHODS.has(effectiveMethod)) {
    if (!mcpName || !mcpName.trim()) {
      return {
        ok: false,
        status: 400,
        error: 'Missing required header: Mcp-Name for named method',
        code: -32600,
      };
    }
    if (bodyName && mcpName !== bodyName) {
      return {
        ok: false,
        status: 400,
        error: 'Mcp-Name header/body disagreement',
        code: -32600,
      };
    }
  }

  return {
    ok: true,
    method: effectiveMethod,
    name: mcpName,
    protocolVersion: protocolVersion.trim(),
  };
}

export interface TraceContext {
  traceparent?: string;
  tracestate?: string;
  baggage?: string;
}

/** Extract W3C Trace Context keys from request _meta (SEP-414). */
export function extractTraceContext(body: unknown): TraceContext {
  const req = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const params =
    req?.params && typeof req.params === 'object'
      ? (req.params as Record<string, unknown>)
      : undefined;
  const metaRaw = params?._meta ?? req?._meta;
  if (!metaRaw || typeof metaRaw !== 'object') return {};
  const meta = metaRaw as Record<string, unknown>;
  const out: TraceContext = {};
  if (typeof meta.traceparent === 'string') out.traceparent = meta.traceparent;
  if (typeof meta.tracestate === 'string') out.tracestate = meta.tracestate;
  if (typeof meta.baggage === 'string') out.baggage = meta.baggage;
  return out;
}

export function buildWwwAuthenticateHeader(resourceMetadataUrl: string): string {
  return `Bearer realm="fidusgate", resource_metadata="${resourceMetadataUrl}"`;
}

export function buildProtectedResourceMetadata(baseUrl: string): Record<string, unknown> {
  const resource = `${baseUrl.replace(/\/$/, '')}/mcp`;
  return {
    resource,
    authorization_servers: [baseUrl.replace(/\/$/, '')],
    scopes_supported: ['mcp:tools', 'mcp:read', 'mcp:write'],
    bearer_methods_supported: ['header'],
    resource_documentation: 'https://github.com/SafetyMP/FidusGate/blob/main/docs/mcp-2026-07-28-migration.md',
  };
}
