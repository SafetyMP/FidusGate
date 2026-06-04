import * as readline from 'node:readline';
import { isCommandLineSecure } from './command-auditor';
import { CedarEvaluator } from './cedar-evaluator';
import { FidusGateDatabase } from '@fidusgate/database';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

const db = new FidusGateDatabase();
const configPath = path.resolve(process.cwd(), 'protect-mcp.config.json');
let config: any = { mode: 'enforce' };
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e: any) {
    console.error('Failed to parse config:', e.message);
  }
}

const policyPath = path.resolve(process.cwd(), config.policy || 'policy.cedar');
const evaluator = new CedarEvaluator(policyPath);

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

async function handleMcpRequest(req: any): Promise<any> {
  const { jsonrpc, method, id, params } = req;
  
  if (jsonrpc !== '2.0') {
    return {
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Invalid Request' },
      id: id || null
    };
  }

  // Handle standard initialization handshake
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'fidusgate-secure-gateway',
          version: '1.2.0-Enterprise'
        }
      },
      id
    };
  }

  if (method === 'notifications/initialized') {
    return null; // No response required for notifications
  }

  // Handle tools/list
  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      result: {
        tools: [
          {
            name: 'execute_command',
            description: 'Run a shell command securely inside FidusGate\'s unprivileged Docker container sandbox (gVisor optional).',
            inputSchema: {
              type: 'object',
              properties: {
                commandLine: {
                  type: 'string',
                  description: 'The shell command line string to execute.'
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
                }
              },
              required: ['path', 'content']
            }
          }
        ]
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

      // 1. Audit check
      const auditResult = isCommandLineSecure(commandLine);
      if (!auditResult.secure) {
        await db.addCommandLog({
          id: `cmd_${Math.floor(100000 + Math.random() * 900000)}`,
          timestamp: new Date().toISOString(),
          command: commandLine,
          user: 'mcp-agent@fidusgate.internal',
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
      const evaluation = evaluator.evaluateSimulator('mcp-agent@fidusgate.internal', 'execute_command', { commandLine }, {});
      if (evaluation.decision === 'deny') {
        await db.addCommandLog({
          id: `cmd_${Math.floor(100000 + Math.random() * 900000)}`,
          timestamp: new Date().toISOString(),
          command: commandLine,
          user: 'mcp-agent@fidusgate.internal',
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

      // 3. Execution inside sandbox
      const workspacePath = path.resolve(__dirname, '..', '..', '..');
      const sandboxCmd = `bash scripts/sandbox-execute.sh "${commandLine}" "${workspacePath}"`;

      try {
        const logs = execSync(sandboxCmd, { cwd: workspacePath, encoding: 'utf8', stdio: 'pipe' });
        await db.addCommandLog({
          id: `cmd_${Math.floor(100000 + Math.random() * 900000)}`,
          timestamp: new Date().toISOString(),
          command: commandLine,
          user: 'mcp-agent@fidusgate.internal',
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
          user: 'mcp-agent@fidusgate.internal',
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

      // Cedar Policy Check
      const evaluation = evaluator.evaluateSimulator('mcp-agent@fidusgate.internal', 'write_file', { path: filePath }, {});
      if (evaluation.decision === 'deny') {
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
