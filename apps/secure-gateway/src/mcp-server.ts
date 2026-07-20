import * as readline from 'node:readline';
import { isCommandLineSecure } from './command-auditor';
import { CedarEvaluator } from './cedar-evaluator';
import { FidusGateDatabase } from '@fidusgate/database';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import {
  DevOpsComplianceTracker,
  IBPComplianceTracker,
  PLMComplianceTracker
} from './compliance-trackers';
import { sanitizeLogValue } from './security-sanitize';
import {
  MCP_PROTOCOL_2025,
  MCP_PROTOCOL_2026,
  MCP_PROTOCOL_LEGACY,
} from './mcp-http';

const MCP_SERVER_INFO = {
  name: 'fidusgate-secure-gateway',
  version: '1.2.0-Enterprise',
};

const MCP_TOOLS_CAPABILITIES = { tools: {} as Record<string, unknown> };

/** Demo cache hints for list results (SEP-2549). */
const MCP_LIST_CACHE = { ttlMs: 60_000, cacheScope: 'private' as const };

function negotiateLegacyProtocolVersion(requested: unknown): string {
  if (requested === MCP_PROTOCOL_LEGACY) return MCP_PROTOCOL_LEGACY;
  if (requested === MCP_PROTOCOL_2025) return MCP_PROTOCOL_2025;
  // Prefer 2025-11-25 for dual-era legacy handshake when client omits or sends modern.
  return MCP_PROTOCOL_2025;
}

function getToolDefinitions() {
  return [
          {
            name: 'execute_command',
            description: 'Run a shell command securely inside FidusGate\'s unprivileged Docker container sandbox (gVisor optional).',
            inputSchema: {
              type: 'object',
              properties: {
                commandLine: {
                  type: 'string',
                  description: 'The shell command line string to execute.'
                },
                principal: {
                  type: 'string',
                  description: 'Optional agent principal (e.g. sb:issuer:devops-sme, sb:issuer:de073ae64e43) for Cedar policy enforcement.'
                },
                signature: {
                  type: 'string',
                  description: 'Optional Ed25519 signature in hex format (required if a privileged principal is specified).'
                }
              },
              required: ['commandLine']
            }
          },
          {
            name: 'write_file',
            description: 'Write or modify a file inside the sandboxed workspace directory.',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Absolute or relative path to the target file.'
                },
                content: {
                  type: 'string',
                  description: 'The string content to write to the file.'
                },
                principal: {
                  type: 'string',
                  description: 'Optional agent principal (e.g. sb:issuer:devops-sme, sb:issuer:de073ae64e43) for Cedar policy enforcement.'
                },
                signature: {
                  type: 'string',
                  description: 'Optional Ed25519 signature in hex format (required if a privileged principal is specified).'
                }
              },
              required: ['path', 'content']
            }
          },
          {
            name: 'read_file',
            description: 'Read the contents of a file inside the sandboxed workspace directory.',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Absolute or relative path to the target file.'
                },
                startLine: {
                  type: 'integer',
                  description: 'Optional start line number (1-indexed).'
                },
                endLine: {
                  type: 'integer',
                  description: 'Optional end line number (1-indexed).'
                }
              },
              required: ['path']
            }
          },
          {
            name: 'patch_file',
            description: 'Apply a single search-and-replace patch to a file in the workspace directory.',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Absolute or relative path to the target file.'
                },
                targetContent: {
                  type: 'string',
                  description: 'The exact string content inside the file to be replaced.'
                },
                replacementContent: {
                  type: 'string',
                  description: 'The string content to replace targetContent with.'
                },
                startLine: {
                  type: 'integer',
                  description: 'Optional start line number of the range to look for targetContent.'
                },
                endLine: {
                  type: 'integer',
                  description: 'Optional end line number of the range to look for targetContent.'
                },
                principal: {
                  type: 'string',
                  description: 'Optional agent principal (e.g. sb:issuer:devops-sme, sb:issuer:de073ae64e43) for Cedar policy enforcement.'
                },
                signature: {
                  type: 'string',
                  description: 'Optional Ed25519 signature in hex format (required if a privileged principal is specified).'
                }
              },
              required: ['path', 'targetContent', 'replacementContent']
            }
          },
          {
            name: 'search_code',
            description: 'Search for a query pattern recursively inside the workspace files (Node-native grep).',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The query text or pattern to look for.'
                },
                searchPath: {
                  type: 'string',
                  description: 'Optional relative path to a subfolder to search inside.'
                },
                caseInsensitive: {
                  type: 'boolean',
                  description: 'Whether to ignore case during searching.'
                },
                isRegex: {
                  type: 'boolean',
                  description: 'Whether to treat query as a regular expression pattern.'
                }
              },
              required: ['query']
            }
          },
          {
            name: 'list_directory',
            description: 'List contents of a directory in the workspace.',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Absolute or relative path to list contents of.'
                }
              },
              required: ['path']
            }
          },
          {
            name: 'submit_ibp_synthesis',
            description: 'Submit the Sprint Sprint cross-functional IBP synthesis report to unlock gates.',
            inputSchema: {
              type: 'object',
              properties: {
                report: {
                  type: 'string',
                  description: 'The text of the Sprint synthesis report.'
                }
              },
              required: ['report']
            }
          }
  ];
}

const PUBLIC_KEY_MAP: Record<string, string> = {
  'sb:issuer:de073ae64e43': '302a300506032b6570032100df20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de83',
  'sb:issuer:pm-sme': '302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de81',
  'sb:issuer:architecture-sme': '302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de82',
  'sb:issuer:backend-sme': '302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de83',
  'sb:issuer:frontend-sme': '302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de84',
  'sb:issuer:qa-sme': '302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de85',
  'sb:issuer:security-sme': '302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de86',
  'sb:issuer:devops-sme': '302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de87'
};

// Check if we have a cached dev keypair in packages/database/data/test-keys.json to avoid breaking signatures across restarts
const devKeysPath = path.resolve(process.cwd(), 'packages/database/data/test-keys.json');
if (fs.existsSync(devKeysPath)) {
  try {
    const cachedKeys = JSON.parse(fs.readFileSync(devKeysPath, 'utf8'));
    if (cachedKeys && cachedKeys.publicKeyHex) {
      PUBLIC_KEY_MAP['sb:issuer:de073ae64e43'] = cachedKeys.publicKeyHex;
    }
  } catch (e) {}
}

function verifyAgentPrincipalSignature(toolName: string, args: any): boolean {
  const principal = args.principal;
  if (!principal || !principal.startsWith('sb:issuer:')) {
    // Standard un-privileged agent. No signature required.
    return true;
  }

  const publicKeyHex = PUBLIC_KEY_MAP[principal];
  if (!publicKeyHex) {
    console.error(`[FidusGate] Cryptographic verification failed: Principal '${sanitizeLogValue(principal)}' is not recognized.`);
    return false;
  }

  const signatureHex = args.signature;
  if (!signatureHex) {
    console.error(`[FidusGate] Cryptographic verification failed: Signature parameter is missing for privileged principal '${sanitizeLogValue(principal)}'.`);
    return false;
  }

  try {
    const payload: Record<string, any> = {
      principal: principal,
      tool: toolName,
      args: {}
    };

    if (toolName === 'execute_command') {
      payload.args = { commandLine: args.commandLine };
    } else if (toolName === 'write_file') {
      payload.args = { path: args.path, content: args.content };
    } else if (toolName === 'patch_file') {
      payload.args = {
        path: args.path,
        targetContent: args.targetContent,
        replacementContent: args.replacementContent
      };
    }

    const data = Buffer.from(JSON.stringify(payload));
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(publicKeyHex, 'hex'),
      format: 'der',
      type: 'spki'
    });
    const signature = Buffer.from(signatureHex, 'hex');

    return crypto.verify(null, data, publicKey, signature);
  } catch (err: any) {
    console.error(`[FidusGate] Exception in verifying principal signature:`, err.message);
    return false;
  }
}

const db = new FidusGateDatabase();

const principalViolationCounts: Record<string, number> = {};

export async function recordPrincipalViolation(principal: string): Promise<void> {
  if (!principal || principal === 'sb:issuer:test' || principal === 'mcp-agent@fidusgate.internal') return;
  principalViolationCounts[principal] = (principalViolationCounts[principal] || 0) + 1;
  if (principalViolationCounts[principal] >= 3) {
    const existing = await db.getQuarantineRecord(principal);
    if (!existing) {
      await db.quarantinePrincipal({
        principalId: principal,
        quarantinedAt: new Date().toISOString(),
        reason: `Auto-quarantined: 3 consecutive Cedar policy denials`,
        evidence: [`${principalViolationCounts[principal]} consecutive Cedar denials`]
      });
      console.error(`[FidusGate] 🔒 PRINCIPAL AUTO-QUARANTINED after repeated Cedar violations: ${sanitizeLogValue(principal)}`);
    }
    delete principalViolationCounts[principal];
  }
}

export function resetPrincipalViolations(principal: string): void {
  delete principalViolationCounts[principal];
}

function findRootPath(filename: string): string {
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const fullPath = path.resolve(dir, filename);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(process.cwd(), filename);
}

const configPath = findRootPath('protect-mcp.config.json');
let config: any = { mode: 'enforce' };
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e: any) {
    console.error('Failed to parse config:', e.message);
  }
}

const policyPath = findRootPath(config.policy || 'policy.cedar');
const evaluator = new CedarEvaluator(policyPath);

// Instantiate trackers with a dummy WebSocket broadcaster
const dummyWS = () => {};
const devopsTracker = new DevOpsComplianceTracker(dummyWS);
const ibpTracker = new IBPComplianceTracker(dummyWS);
const plmTracker = new PLMComplianceTracker(dummyWS);

async function getFullContext(principal: string, additional?: Record<string, any>) {
  const isDevopsBypass = process.env.DISABLE_DEVOPS_GATE === 'true';
  const devopsState = isDevopsBypass ? {
    pipelineVerified: true,
    securityAudited: true,
    hamChecked: true
  } : devopsTracker.getState();

  const ibpState = ibpTracker.getState();
  const isBudgetAligned = ibpTracker.isBudgetAligned();
  const plmState = plmTracker.getState();

  const quarantineRecord = principal ? await db.getQuarantineRecord(principal) : null;
  const quarantineContext = quarantineRecord ? { active: true } : { active: false };

  return {
    ...additional,
    quarantine: quarantineContext,
    devops: {
      pipeline_passed: devopsState.pipelineVerified,
      security_audited: devopsState.securityAudited,
      ham_drift_checked: devopsState.hamChecked
    },
    ibp: {
      cross_functional_synthesized: ibpState.crossFunctionalSynthesized,
      budget_aligned: isBudgetAligned,
      budget_exhaustion_percentage: ibpTracker.getBudgetExhaustionPercentage(),
      ...(additional && additional.subagentId ? {
        subagent_budget_aligned: ibpTracker.isSubagentBudgetAligned(additional.subagentId),
        subagent_budget_exhaustion_percentage: ibpTracker.getSubagentBudgetExhaustionPercentage(additional.subagentId),
        subagent_id: additional.subagentId
      } : {})
    },
    plm: {
      active_requirement_id: plmState.activeRequirementId,
      associated_tests_written: plmState.associatedTestsWritten,
      has_api_drift: plmState.hasApiDrift,
      drift_verified: plmState.driftVerified,
      release_version_updated: plmState.releaseVersionUpdated,
      changelog_updated: plmState.changelogUpdated,
      has_active_feedback: plmState.activeDirectives.length > 0,
      feedback_aligned: plmState.feedbackAligned
    }
  };
}

function patchFileHelper(filePath: string, targetContent: string, replacementContent: string, startLine?: number, endLine?: number) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!startLine && !endLine) {
    const occurrences = content.split(targetContent).length - 1;
    if (occurrences === 0) {
      throw new Error(`Target content not found in file.`);
    }
    if (occurrences > 1) {
      throw new Error(`Target content is not unique in file. Found ${occurrences} occurrences.`);
    }
    const newContent = content.replace(targetContent, replacementContent);
    fs.writeFileSync(filePath, newContent, 'utf8');
    return;
  }

  const lines = content.split('\n');
  const startIdx = startLine ? Math.max(1, startLine) - 1 : 0;
  const endIdx = endLine ? Math.min(lines.length, endLine) - 1 : lines.length - 1;

  const rangeText = lines.slice(startIdx, endIdx + 1).join('\n');
  const targetIdx = rangeText.indexOf(targetContent);
  if (targetIdx === -1) {
    throw new Error(`Target content not found in the specified line range [${startLine || 1}, ${endLine || lines.length}].`);
  }
  
  const occurrences = rangeText.split(targetContent).length - 1;
  if (occurrences > 1) {
    throw new Error(`Target content is not unique in the specified line range. Found ${occurrences} occurrences.`);
  }

  const newRangeText = rangeText.replace(targetContent, replacementContent);
  
  const beforeRange = lines.slice(0, startIdx).join('\n');
  const afterRange = lines.slice(endIdx + 1).join('\n');
  
  let finalContent = '';
  if (startIdx > 0) {
    finalContent += beforeRange + '\n';
  }
  finalContent += newRangeText;
  if (endIdx < lines.length - 1) {
    finalContent += '\n' + afterRange;
  }

  fs.writeFileSync(filePath, finalContent, 'utf8');
}

function searchCodeHelper(dir: string, query: string, caseInsensitive = false, isRegex = false): { file: string; line: number; content: string }[] {
  const results: { file: string; line: number; content: string }[] = [];
  let regex: RegExp;
  if (isRegex) {
    regex = new RegExp(query, caseInsensitive ? 'i' : '');
  } else {
    const escaped = query.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    regex = new RegExp(escaped, caseInsensitive ? 'i' : '');
  }

  function traverse(currentDir: string) {
    // readdir with withFileTypes so we don't have to re-stat each entry;
    // avoids the readdir -> stat -> read race (CodeQL js/file-system-race).
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const entry of entries) {
      const file = entry.name;
      const fullPath = path.join(currentDir, file);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', '.memory', 'dist', 'build', '.turbo'].includes(file)) {
          continue;
        }
        traverse(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(file).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', '.mp3', '.wav', '.DS_Store'].includes(ext)) {
          continue;
        }
        let fd: number | null = null;
        try {
          fd = fs.openSync(fullPath, 'r');
          const stat = fs.fstatSync(fd);
          if (stat.size > 2 * 1024 * 1024) continue;
          const buf = Buffer.alloc(stat.size);
          let offset = 0;
          while (offset < stat.size) {
            const read = fs.readSync(fd, buf, offset, stat.size - offset, offset);
            if (read <= 0) break;
            offset += read;
          }
          const content = buf.slice(0, offset).toString('utf8');
          if (content.includes('\0')) continue;
          const lines = content.split('\n');
          for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
            const line = lines[lineNum - 1];
            if (regex.test(line)) {
              results.push({
                file: path.relative(dir, fullPath),
                line: lineNum,
                content: line.trim()
              });
              if (results.length >= 100) return;
            }
          }
        } catch (e) {
          // Ignore
        } finally {
          if (fd !== null) {
            try { fs.closeSync(fd); } catch {}
          }
        }
      }
    }
  }

  traverse(dir);
  return results;
}

export function startMcpServer() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  console.error('[FidusGate] Secure MCP Server booted successfully, listening on stdin...');

  rl.on('line', async (line) => {
    if (!line.trim()) return;
    try {
      const request = JSON.parse(line);
      const response = await handleMcpRequest(request);
      if (response) {
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch (err: any) {
      console.error('[FidusGate] JSON-RPC Parse Error:', err.message);
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Parse error' },
        id: null
      }) + '\n');
    }
  });
}

export async function handleMcpRequest(req: any): Promise<any> {
  const { jsonrpc, method, id, params } = req;
  
  if (jsonrpc !== '2.0') {
    return {
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Invalid Request' },
      id: id || null
    };
  }

  // Optional _meta (clientInfo, trace context) is accepted and ignored at the
  // protocol layer — application state stays in PLM/IBP trackers and tool args.
  const _meta =
    params && typeof params === 'object' && '_meta' in params
      ? (params as Record<string, unknown>)._meta
      : undefined;
  void _meta;

  // Legacy initialize handshake (2024-11-05 / 2025-11-25 dual-era)
  if (method === 'initialize') {
    const requested =
      params && typeof params === 'object'
        ? (params as Record<string, unknown>).protocolVersion
        : undefined;
    return {
      jsonrpc: '2.0',
      result: {
        protocolVersion: negotiateLegacyProtocolVersion(requested),
        capabilities: MCP_TOOLS_CAPABILITIES,
        serverInfo: MCP_SERVER_INFO,
      },
      id
    };
  }

  if (method === 'notifications/initialized') {
    return null; // No response required for notifications
  }

  // MCP 2026-07-28: server/discover replaces capability exchange via initialize
  if (method === 'server/discover') {
    return {
      jsonrpc: '2.0',
      result: {
        protocolVersion: MCP_PROTOCOL_2026,
        capabilities: MCP_TOOLS_CAPABILITIES,
        serverInfo: MCP_SERVER_INFO,
        // Roots, Sampling, and Logging are deprecated and not offered.
        deprecatedNotOffered: ['roots', 'sampling', 'logging'],
      },
      id
    };
  }

  // Handle tools/list
  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      result: {
        tools: getToolDefinitions(),
        ...MCP_LIST_CACHE,
      },
      id
    };
  }

  // Handle tools/call
  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    
    if (name === 'execute_command') {
      const { commandLine } = args || {};
      if (!commandLine) {
        return {
          jsonrpc: '2.0',
          error: { code: -32602, message: 'Invalid params: commandLine is required' },
          id
        };
      }

      // Cryptographic Principal Verification Check
      if (!verifyAgentPrincipalSignature(name, args)) {
        return {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: `❌ FidusGate Cryptographic Attestation Blocked: Privileged principal '${args.principal}' signature verification failed.`
              }
            ],
            isError: true
          },
          id
        };
      }

      // 1. Audit check
      const auditResult = isCommandLineSecure(commandLine);
      if (!auditResult.secure) {
        await db.addCommandLog({
          id: `cmd_${Math.floor(100000 + Math.random() * 900000)}`,
          timestamp: new Date().toISOString(),
          command: commandLine,
          user: args.principal || 'mcp-agent@fidusgate.internal',
          role: 'developer',
          status: 'failed',
          exitCode: 1,
          cedarDecision: 'deny'
        });

        return {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: `❌ FidusGate Security Gatekeeper Denied: Command execution forbidden. Reason: ${auditResult.reason}\n💡 Suggested Remediation: ${auditResult.remediationSuggestion}`
              }
            ],
            isError: true
          },
          id
        };
      }

      // 2. Cedar Policy Check
      const callerPrincipal = args.principal || 'mcp-agent@fidusgate.internal';
      const contextObj = await getFullContext(callerPrincipal, { commandLine });
      const evaluation = evaluator.evaluateSimulator(callerPrincipal, 'execute_command', { commandLine }, contextObj);
      if (evaluation.decision === 'deny') {
        await recordPrincipalViolation(callerPrincipal);
        await db.addCommandLog({
          id: `cmd_${Math.floor(100000 + Math.random() * 900000)}`,
          timestamp: new Date().toISOString(),
          command: commandLine,
          user: callerPrincipal,
          role: 'developer',
          status: 'failed',
          exitCode: 1,
          cedarDecision: 'deny'
        });

        return {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: `❌ FidusGate Cedar Policy Blocker: Execution denied. Matching policies: ${evaluation.matchingPolicies.join(', ')}`
              }
            ],
            isError: true
          },
          id
        };
      }

      resetPrincipalViolations(callerPrincipal);

      // 3. Execution inside sandbox
      const workspacePath = path.resolve(__dirname, '..', '..', '..');
      const sandboxCmd = `bash scripts/sandbox-execute.sh "${commandLine}" "${workspacePath}"`;

      try {
        const logs = execSync(sandboxCmd, { cwd: workspacePath, encoding: 'utf8', stdio: 'pipe' });
        await db.addCommandLog({
          id: `cmd_${Math.floor(100000 + Math.random() * 900000)}`,
          timestamp: new Date().toISOString(),
          command: commandLine,
          user: callerPrincipal,
          role: 'developer',
          status: 'success',
          exitCode: 0,
          cedarDecision: 'allow'
        });

        return {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: logs }]
          },
          id
        };
      } catch (err: any) {
        const errorLogs = [err.stdout, err.stderr].filter(Boolean).join('\n') || err.message;
        await db.addCommandLog({
          id: `cmd_${Math.floor(100000 + Math.random() * 900000)}`,
          timestamp: new Date().toISOString(),
          command: commandLine,
          user: callerPrincipal,
          role: 'developer',
          status: 'failed',
          exitCode: err.status || 1,
          cedarDecision: 'allow'
        });

        return {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: `❌ Sandboxed Execution Error:\n${errorLogs}` }],
            isError: true
          },
          id
        };
      }
    }

    if (name === 'write_file') {
      const { path: filePath, content } = args || {};
      if (!filePath || content === undefined) {
        return {
          jsonrpc: '2.0',
          error: { code: -32602, message: 'Invalid params: path and content are required' },
          id
        };
      }

      // Cryptographic Principal Verification Check
      if (!verifyAgentPrincipalSignature(name, args)) {
        return {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: `❌ FidusGate Cryptographic Attestation Blocked: Privileged principal '${args.principal}' signature verification failed.`
              }
            ],
            isError: true
          },
          id
        };
      }

      // Cedar Policy Check
      const callerPrincipal = args.principal || 'mcp-agent@fidusgate.internal';
      const contextObj = await getFullContext(callerPrincipal, { path: filePath });
      const evaluation = evaluator.evaluateSimulator(callerPrincipal, 'write_file', { path: filePath }, contextObj);
      if (evaluation.decision === 'deny') {
        await recordPrincipalViolation(callerPrincipal);
        return {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: `❌ FidusGate Cedar Policy Blocker: Write operation denied for path: ${filePath}. Matching policies: ${evaluation.matchingPolicies.join(', ')}`
              }
            ],
            isError: true
          },
          id
        };
      }

      resetPrincipalViolations(callerPrincipal);

      try {
        const workspacePath = path.resolve(__dirname, '..', '..', '..');
        const resolvedPath = path.resolve(workspacePath, filePath);
        
        // Enforce sandbox write boundaries
        if (!resolvedPath.startsWith(workspacePath)) {
          return {
            jsonrpc: '2.0',
            result: {
              content: [{ type: 'text', text: `❌ FidusGate Directory Boundary Violation: Cannot write outside workspace: ${filePath}` }],
              isError: true
            },
            id
          };
        }

        fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
        fs.writeFileSync(resolvedPath, content, 'utf8');

        // Invalidate synthesis report on write
        ibpTracker.invalidateSynthesis();

        await db.addCommandLog({
          id: `write_${Math.floor(100000 + Math.random() * 900000)}`,
          timestamp: new Date().toISOString(),
          command: `write_file ${filePath}`,
          user: callerPrincipal,
          role: 'developer',
          status: 'success',
          exitCode: 0,
          cedarDecision: 'allow'
        });

        return {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: `✅ File successfully written to: ${filePath}` }]
          },
          id
        };
      } catch (err: any) {
        return {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: `❌ Write Error: ${err.message}` }],
            isError: true
          },
          id
        };
      }
    }

    if (name === 'read_file') {
      const { path: filePath, startLine, endLine } = args || {};
      if (!filePath) {
        return {
          jsonrpc: '2.0',
          error: { code: -32602, message: 'Invalid params: path is required' },
          id
        };
      }

      const workspacePath = path.resolve(__dirname, '..', '..', '..');
      const resolvedPath = path.resolve(workspacePath, filePath);
      
      // Sandbox boundary check
      if (!resolvedPath.startsWith(workspacePath)) {
        return {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: `❌ FidusGate Directory Boundary Violation: Cannot read outside workspace: ${filePath}` }],
            isError: true
          },
          id
        };
      }

      // Secret path check
      const filename = path.basename(resolvedPath);
      if (filename.includes('.env') || filename.includes('test-keys') || resolvedPath.endsWith('.key') || resolvedPath.endsWith('.pem')) {
        return {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: `❌ FidusGate Security Gatekeeper Denied: Access to sensitive file ${filename} is blocked.` }],
            isError: true
          },
          id
        };
      }

      const callerPrincipal = args.principal || 'mcp-agent@fidusgate.internal';
      // Cedar Policy Check
      const contextObj = await getFullContext(callerPrincipal, { path: filePath });
      const evaluation = evaluator.evaluateSimulator(callerPrincipal, 'read_file', { path: filePath }, contextObj);
      if (evaluation.decision === 'deny') {
        return {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: `❌ FidusGate Cedar Policy Blocker: Read operation denied for path: ${filePath}. Matching policies: ${evaluation.matchingPolicies.join(', ')}`
              }
            ],
            isError: true
          },
          id
        };
      }

      try {
        if (!fs.existsSync(resolvedPath)) {
          return {
            jsonrpc: '2.0',
            result: { content: [{ type: 'text', text: `❌ File not found: ${filePath}` }], isError: true },
            id
          };
        }

        const fileContent = fs.readFileSync(resolvedPath, 'utf8');
        let resultText = '';
        if (startLine !== undefined || endLine !== undefined) {
          const lines = fileContent.split('\n');
          const start = startLine !== undefined ? Math.max(1, startLine) : 1;
          const end = endLine !== undefined ? Math.min(lines.length, endLine) : lines.length;
          resultText = lines.slice(start - 1, end).join('\n');
        } else {
          resultText = fileContent;
        }

        return {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: resultText }]
          },
          id
        };
      } catch (err: any) {
        return {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: `❌ Read Error: ${err.message}` }],
            isError: true
          },
          id
        };
      }
    }

    if (name === 'patch_file') {
      const { path: filePath, targetContent, replacementContent, startLine, endLine } = args || {};
      if (!filePath || targetContent === undefined || replacementContent === undefined) {
        return {
          jsonrpc: '2.0',
          error: { code: -32602, message: 'Invalid params: path, targetContent and replacementContent are required' },
          id
        };
      }

      // Cryptographic Principal Verification Check
      if (!verifyAgentPrincipalSignature(name, args)) {
        return {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: `❌ FidusGate Cryptographic Attestation Blocked: Privileged principal '${args.principal}' signature verification failed.`
              }
            ],
            isError: true
          },
          id
        };
      }

      const callerPrincipal = args.principal || 'mcp-agent@fidusgate.internal';
      const contextObj = await getFullContext(callerPrincipal, { path: filePath });
      const evaluation = evaluator.evaluateSimulator(callerPrincipal, 'patch_file', { path: filePath }, contextObj);
      if (evaluation.decision === 'deny') {
        await recordPrincipalViolation(callerPrincipal);
        return {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: `❌ FidusGate Cedar Policy Blocker: Patch operation denied for path: ${filePath}. Matching policies: ${evaluation.matchingPolicies.join(', ')}`
              }
            ],
            isError: true
          },
          id
        };
      }

      resetPrincipalViolations(callerPrincipal);

      try {
        const workspacePath = path.resolve(__dirname, '..', '..', '..');
        const resolvedPath = path.resolve(workspacePath, filePath);
        
        // Enforce sandbox write boundaries
        if (!resolvedPath.startsWith(workspacePath)) {
          return {
            jsonrpc: '2.0',
            result: {
              content: [{ type: 'text', text: `❌ FidusGate Directory Boundary Violation: Cannot patch outside workspace: ${filePath}` }],
              isError: true
            },
            id
          };
        }

        patchFileHelper(resolvedPath, targetContent, replacementContent, startLine, endLine);

        // Invalidate synthesis report on write
        ibpTracker.invalidateSynthesis();

        await db.addCommandLog({
          id: `patch_${Math.floor(100000 + Math.random() * 900000)}`,
          timestamp: new Date().toISOString(),
          command: `patch_file ${filePath}`,
          user: callerPrincipal,
          role: 'developer',
          status: 'success',
          exitCode: 0,
          cedarDecision: 'allow'
        });

        return {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: `✅ File successfully patched: ${filePath}` }]
          },
          id
        };
      } catch (err: any) {
        return {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: `❌ Patch Error: ${err.message}` }],
            isError: true
          },
          id
        };
      }
    }

    if (name === 'search_code') {
      const { query, searchPath, caseInsensitive, isRegex } = args || {};
      if (!query) {
        return {
          jsonrpc: '2.0',
          error: { code: -32602, message: 'Invalid params: query is required' },
          id
        };
      }

      const workspacePath = path.resolve(__dirname, '..', '..', '..');
      const searchDir = searchPath ? path.resolve(workspacePath, searchPath) : workspacePath;

      if (!searchDir.startsWith(workspacePath)) {
        return {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: `❌ FidusGate Directory Boundary Violation: Cannot search outside workspace: ${searchPath}` }],
            isError: true
          },
          id
        };
      }

      const callerPrincipal = args.principal || 'mcp-agent@fidusgate.internal';
      // Cedar Policy Check
      const contextObj = await getFullContext(callerPrincipal, { query, searchPath });
      const evaluation = evaluator.evaluateSimulator(callerPrincipal, 'search_code', { query, searchPath }, contextObj);
      if (evaluation.decision === 'deny') {
        return {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: `❌ FidusGate Cedar Policy Blocker: Search denied. Matching policies: ${evaluation.matchingPolicies.join(', ')}`
              }
            ],
            isError: true
          },
          id
        };
      }

      try {
        const results = searchCodeHelper(searchDir, query, caseInsensitive, isRegex);
        return {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
          },
          id
        };
      } catch (err: any) {
        return {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: `❌ Search Error: ${err.message}` }],
            isError: true
          },
          id
        };
      }
    }

    if (name === 'list_directory') {
      const { path: filePath } = args || {};
      if (!filePath) {
        return {
          jsonrpc: '2.0',
          error: { code: -32602, message: 'Invalid params: path is required' },
          id
        };
      }

      const workspacePath = path.resolve(__dirname, '..', '..', '..');
      const resolvedPath = path.resolve(workspacePath, filePath);

      if (!resolvedPath.startsWith(workspacePath)) {
        return {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: `❌ FidusGate Directory Boundary Violation: Cannot list outside workspace: ${filePath}` }],
            isError: true
          },
          id
        };
      }

      const callerPrincipal = args.principal || 'mcp-agent@fidusgate.internal';
      // Cedar Policy Check
      const contextObj = await getFullContext(callerPrincipal, { path: filePath });
      const evaluation = evaluator.evaluateSimulator(callerPrincipal, 'list_directory', { path: filePath }, contextObj);
      if (evaluation.decision === 'deny') {
        return {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: `❌ FidusGate Cedar Policy Blocker: List directory denied. Matching policies: ${evaluation.matchingPolicies.join(', ')}`
              }
            ],
            isError: true
          },
          id
        };
      }

      try {
        if (!fs.existsSync(resolvedPath)) {
          return {
            jsonrpc: '2.0',
            result: { content: [{ type: 'text', text: `❌ Directory not found: ${filePath}` }], isError: true },
            id
          };
        }
        const stat = fs.statSync(resolvedPath);
        if (!stat.isDirectory()) {
          return {
            jsonrpc: '2.0',
            result: { content: [{ type: 'text', text: `❌ Path is not a directory: ${filePath}` }], isError: true },
            id
          };
        }

        const files = fs.readdirSync(resolvedPath);
        const results = files.map(file => {
          const full = path.join(resolvedPath, file);
          let itemStat;
          try {
            itemStat = fs.statSync(full);
          } catch (e) {
            return { name: file, isDir: false, sizeBytes: 0, error: true };
          }
          return {
            name: file,
            isDir: itemStat.isDirectory(),
            sizeBytes: itemStat.size
          };
        });

        return {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
          },
          id
        };
      } catch (err: any) {
        return {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: `❌ List Directory Error: ${err.message}` }],
            isError: true
          },
          id
        };
      }
    }

    if (name === 'submit_ibp_synthesis') {
      const { report } = args || {};
      if (!report) {
        return {
          jsonrpc: '2.0',
          error: { code: -32602, message: 'Invalid params: report is required' },
          id
        };
      }

      try {
        ibpTracker.submitSynthesis(report);
        return {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: `✅ IBP Synthesis successfully submitted and gate cleared.` }]
          },
          id
        };
      } catch (err: any) {
        return {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: `❌ IBP Synthesis Error: ${err.message}` }],
            isError: true
          },
          id
        };
      }
    }

    return {
      jsonrpc: '2.0',
      error: { code: -32601, message: `Method not found: tools/call name=${name}` },
      id
    };
  }

  return {
    jsonrpc: '2.0',
    error: { code: -32601, message: `Method not found: ${method}` },
    id
  };
}
