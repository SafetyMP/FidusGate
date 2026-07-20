/**
 * Streamable HTTP helpers for MCP 2026-07-28 (SEP-2243 header routing).
 * Validates Mcp-Method / Mcp-Name against the JSON-RPC body before Cedar evaluation.
 */

import { safeRecordKey } from './security-sanitize';

export const MCP_PROTOCOL_2026 = '2026-07-28';
export const MCP_PROTOCOL_2025 = '2025-11-25';
export const MCP_PROTOCOL_LEGACY = '2024-11-05';

/** Methods accepted on POST /mcp after header validation. */
const MCP_HTTP_METHODS: Record<string, string> = {
  initialize: 'initialize',
  'notifications/initialized': 'notifications/initialized',
  'server/discover': 'server/discover',
  'tools/list': 'tools/list',
  'tools/call': 'tools/call',
};

/**
 * Tools callable over Streamable HTTP. Filesystem-mutating tools stay on stdio MCP
 * so HTTP request bodies never reach fs.write* sinks (CodeQL js/http-to-file-access).
 */
const MCP_HTTP_TOOLS: Record<string, string> = {
  execute_command: 'execute_command',
  read_file: 'read_file',
  search_code: 'search_code',
  list_directory: 'list_directory',
};

const HTTP_FS_MUTATING_TOOLS = new Set(['write_file', 'patch_file', 'submit_ibp_synthesis']);

/** Dual-era initialize negotiation (legacy 2024-11-05 / 2025-11-25). */
export function negotiateLegacyProtocolVersion(requested: unknown): string {
  if (requested === MCP_PROTOCOL_LEGACY) return MCP_PROTOCOL_LEGACY;
  if (requested === MCP_PROTOCOL_2025) return MCP_PROTOCOL_2025;
  return MCP_PROTOCOL_2025;
}

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

function normalizeJsonRpcId(value: unknown): string | number | null {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length <= 128) return value.slice(0, 128);
  return null;
}

function rebuildHttpToolArgs(
  toolName: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof args.principal === 'string') {
    try {
      out.principal = safeRecordKey(args.principal, 'principal');
    } catch {
      // Drop malformed principals; Cedar falls back to the default agent identity.
    }
  }
  if (typeof args.signature === 'string' && /^[0-9a-fA-F]{1,2048}$/.test(args.signature)) {
    out.signature = args.signature.slice(0, 2048);
  }

  switch (toolName) {
    case 'execute_command':
      if (typeof args.commandLine === 'string') {
        out.commandLine = args.commandLine.slice(0, 16_384);
      }
      break;
    case 'read_file':
      if (typeof args.path === 'string') out.path = args.path.slice(0, 512);
      if (typeof args.startLine === 'number' && Number.isFinite(args.startLine)) {
        out.startLine = Math.floor(args.startLine);
      }
      if (typeof args.endLine === 'number' && Number.isFinite(args.endLine)) {
        out.endLine = Math.floor(args.endLine);
      }
      break;
    case 'search_code':
      if (typeof args.query === 'string') out.query = args.query.slice(0, 2048);
      if (typeof args.searchPath === 'string') out.searchPath = args.searchPath.slice(0, 512);
      if (typeof args.caseInsensitive === 'boolean') out.caseInsensitive = args.caseInsensitive;
      if (typeof args.isRegex === 'boolean') out.isRegex = args.isRegex;
      break;
    case 'list_directory':
      if (typeof args.path === 'string') out.path = args.path.slice(0, 512);
      break;
    default:
      break;
  }
  return out;
}

export type TrustedMcpHttpRequestResult =
  | { ok: true; request: Record<string, unknown> }
  | { ok: false; status: number; error: string; code: number };

/**
 * Rebuild a pristine JSON-RPC envelope for Streamable HTTP.
 * Uses allowlisted method/tool constants so request taint does not reach MCP sinks.
 */
export function buildTrustedMcpHttpRequest(
  body: unknown,
  validation: { method: string; name?: string }
): TrustedMcpHttpRequestResult {
  const method = MCP_HTTP_METHODS[validation.method];
  if (!method) {
    return {
      ok: false,
      status: 400,
      error: `Unsupported method for Streamable HTTP: ${validation.method}`,
      code: -32600,
    };
  }

  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const id = normalizeJsonRpcId(raw.id);

  if (method === 'initialize') {
    const paramsIn =
      raw.params && typeof raw.params === 'object'
        ? (raw.params as Record<string, unknown>)
        : {};
    const protocolVersion =
      typeof paramsIn.protocolVersion === 'string'
        ? negotiateLegacyProtocolVersion(paramsIn.protocolVersion)
        : MCP_PROTOCOL_2025;
    return {
      ok: true,
      request: {
        jsonrpc: '2.0',
        id,
        method,
        params: {
          protocolVersion,
          capabilities: {},
          clientInfo: { name: 'http', version: '1' },
        },
      },
    };
  }

  if (
    method === 'notifications/initialized' ||
    method === 'server/discover' ||
    method === 'tools/list'
  ) {
    return { ok: true, request: { jsonrpc: '2.0', id, method, params: {} } };
  }

  // tools/call
  const paramsIn =
    raw.params && typeof raw.params === 'object'
      ? (raw.params as Record<string, unknown>)
      : {};
  const requestedName =
    (typeof validation.name === 'string' && validation.name) ||
    (typeof paramsIn.name === 'string' ? paramsIn.name : '');
  if (HTTP_FS_MUTATING_TOOLS.has(requestedName)) {
    return {
      ok: false,
      status: 405,
      error: `Tool '${requestedName}' is not available over Streamable HTTP; use stdio MCP for filesystem mutations.`,
      code: -32601,
    };
  }
  const name = MCP_HTTP_TOOLS[requestedName];
  if (!name) {
    return {
      ok: false,
      status: 400,
      error: `Unknown or unsupported tool for Streamable HTTP: ${requestedName || '(missing)'}`,
      code: -32601,
    };
  }
  const argsIn =
    paramsIn.arguments && typeof paramsIn.arguments === 'object'
      ? (paramsIn.arguments as Record<string, unknown>)
      : {};
  return {
    ok: true,
    request: {
      jsonrpc: '2.0',
      id,
      method,
      params: {
        name,
        arguments: rebuildHttpToolArgs(name, argsIn),
      },
    },
  };
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
