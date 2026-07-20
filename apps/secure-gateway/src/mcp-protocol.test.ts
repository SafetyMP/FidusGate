process.env.FIDUSGATE_TEST = 'true';
import test from 'node:test';
import assert from 'node:assert';
import { handleMcpRequest } from './mcp-server';
import {
  validateMcpStreamableHeaders,
  extractTraceContext,
  buildWwwAuthenticateHeader,
  buildProtectedResourceMetadata,
  buildTrustedMcpHttpRequest,
  MCP_PROTOCOL_2025,
  MCP_PROTOCOL_2026,
  MCP_PROTOCOL_LEGACY,
} from './mcp-http';

test('MCP dual-era protocol: initialize / server/discover / tools/list', async (t) => {
  await t.test('initialize prefers 2025-11-25 when client omits version', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
    });
    assert.strictEqual(res.result.protocolVersion, MCP_PROTOCOL_2025);
    assert.strictEqual(res.result.serverInfo.name, 'fidusgate-secure-gateway');
  });

  await t.test('initialize echoes 2024-11-05 when client requests legacy', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'initialize',
      params: { protocolVersion: MCP_PROTOCOL_LEGACY, capabilities: {} },
    });
    assert.strictEqual(res.result.protocolVersion, MCP_PROTOCOL_LEGACY);
  });

  await t.test('server/discover returns 2026-07-28', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'server/discover',
      params: {
        _meta: {
          'io.modelcontextprotocol/clientInfo': { name: 'modern', version: '2.0' },
        },
      },
    });
    assert.strictEqual(res.result.protocolVersion, MCP_PROTOCOL_2026);
    assert.ok(res.result.capabilities.tools);
    assert.deepStrictEqual(res.result.deprecatedNotOffered, ['roots', 'sampling', 'logging']);
  });

  await t.test('tools/list includes ttlMs and cacheScope', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/list',
      params: {},
    });
    assert.ok(Array.isArray(res.result.tools));
    assert.ok(res.result.tools.length >= 1);
    assert.strictEqual(res.result.ttlMs, 60_000);
    assert.strictEqual(res.result.cacheScope, 'private');
  });

  await t.test('unknown method returns -32601', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'roots/list',
      params: {},
    });
    assert.strictEqual(res.error.code, -32601);
  });
});

test('MCP Streamable HTTP header/body consistency (OWASP / SEP-2243)', async (t) => {
  await t.test('rejects missing Mcp-Method', () => {
    const v = validateMcpStreamableHeaders(
      { 'mcp-protocol-version': MCP_PROTOCOL_2026 },
      { jsonrpc: '2.0', method: 'tools/list', id: 1 }
    );
    assert.strictEqual(v.ok, false);
    if (!v.ok) assert.match(v.error, /Mcp-Method/);
  });

  await t.test('rejects Mcp-Method header/body disagreement', () => {
    const v = validateMcpStreamableHeaders(
      {
        'mcp-protocol-version': MCP_PROTOCOL_2026,
        'mcp-method': 'tools/call',
        'mcp-name': 'write_file',
      },
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }
    );
    assert.strictEqual(v.ok, false);
    if (!v.ok) {
      assert.strictEqual(v.error, 'Mcp-Method header/body disagreement');
      assert.strictEqual(v.status, 400);
    }
  });

  await t.test('rejects Mcp-Name header/body disagreement', () => {
    const v = validateMcpStreamableHeaders(
      {
        'mcp-protocol-version': MCP_PROTOCOL_2026,
        'mcp-method': 'tools/call',
        'mcp-name': 'execute_command',
      },
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'write_file', arguments: {} },
      }
    );
    assert.strictEqual(v.ok, false);
    if (!v.ok) assert.strictEqual(v.error, 'Mcp-Name header/body disagreement');
  });

  await t.test('accepts consistent tools/call headers', () => {
    const v = validateMcpStreamableHeaders(
      {
        'mcp-protocol-version': MCP_PROTOCOL_2026,
        'mcp-method': 'tools/call',
        'mcp-name': 'read_file',
      },
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'read_file', arguments: { path: 'README.md' } },
      }
    );
    assert.strictEqual(v.ok, true);
    if (v.ok) {
      assert.strictEqual(v.method, 'tools/call');
      assert.strictEqual(v.name, 'read_file');
    }
  });

  await t.test('extracts W3C Trace Context from _meta', () => {
    const tc = extractTraceContext({
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {
        _meta: {
          traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
          tracestate: 'congo=t61rcWkgMzE',
        },
      },
    });
    assert.ok(tc.traceparent?.startsWith('00-'));
    assert.strictEqual(tc.tracestate, 'congo=t61rcWkgMzE');
  });

  await t.test('Protected Resource Metadata and WWW-Authenticate shape', () => {
    const meta = buildProtectedResourceMetadata('http://localhost:3001');
    assert.strictEqual(meta.resource, 'http://localhost:3001/mcp');
    assert.deepStrictEqual(meta.authorization_servers, ['http://localhost:3001']);
    const www = buildWwwAuthenticateHeader('http://localhost:3001/.well-known/oauth-protected-resource');
    assert.match(www, /resource_metadata=/);
    assert.match(www, /Bearer/);
  });

  await t.test('trusted HTTP envelope allows read_file and rejects write_file', () => {
    const readOk = buildTrustedMcpHttpRequest(
      {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: { name: 'read_file', arguments: { path: 'README.md' } },
      },
      { method: 'tools/call', name: 'read_file' }
    );
    assert.strictEqual(readOk.ok, true);
    if (readOk.ok) {
      assert.strictEqual((readOk.request.params as any).name, 'read_file');
      assert.strictEqual((readOk.request.params as any).arguments.path, 'README.md');
    }

    const writeDenied = buildTrustedMcpHttpRequest(
      {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: { name: 'write_file', arguments: { path: 'x.ts', content: 'pwn' } },
      },
      { method: 'tools/call', name: 'write_file' }
    );
    assert.strictEqual(writeDenied.ok, false);
    if (!writeDenied.ok) {
      assert.strictEqual(writeDenied.status, 405);
      assert.match(writeDenied.error, /stdio MCP/);
    }
  });
});
