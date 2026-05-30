import * as path from 'node:path';

/**
 * Tokenizes a raw shell command line string into its argument components,
 * respecting double quotes, single quotes, and backslash escaping.
 */
export function parseShellCommand(commandLine: string): string[] {
  const args: string[] = [];
  let current = '';
  let inDoubleQuotes = false;
  let inSingleQuotes = false;
  let escaped = false;

  for (let i = 0; i < commandLine.length; i++) {
    const char = commandLine[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"' && !inSingleQuotes) {
      inDoubleQuotes = !inDoubleQuotes;
      continue;
    }

    if (char === "'" && !inDoubleQuotes) {
      inSingleQuotes = !inSingleQuotes;
      continue;
    }

    if ((char === ' ' || char === '\t') && !inDoubleQuotes && !inSingleQuotes) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    args.push(current);
  }

  return args;
}

export interface AuditResult {
  secure: boolean;
  reason?: string;
}

/**
 * Audits a tokenized command line against a strict, zero-trust binary allowlist schema.
 */
export function isCommandLineSecure(commandLine: string): AuditResult {
  const cleanCmd = commandLine.trim();
  if (cleanCmd.length === 0) {
    return { secure: false, reason: 'Command line is empty.' };
  }

  const args = parseShellCommand(cleanCmd);
  if (args.length === 0) {
    return { secure: false, reason: 'Parsed command arguments array is empty.' };
  }

  // Normalize the binary path (e.g. /usr/bin/curl -> curl, curl.exe -> curl)
  const rawBinary = args[0];
  const binaryName = path.basename(rawBinary).toLowerCase().replace(/\.exe$/, '');

  // Denylist critical tools for defense-in-depth (blocked globally across all paths)
  const forbiddenBinaries = [
    'curl', 'wget', 'pip', 'pip3', 'python', 'python3', 'go', 'cargo',
    'rustc', 'gcc', 'g++', 'clang', 'ssh', 'scp', 'ftp', 'telnet'
  ];
  
  if (forbiddenBinaries.includes(binaryName)) {
    return {
      secure: false,
      reason: `Binary '${binaryName}' is explicitly forbidden to prevent network downloads and unauthorized compilation.`
    };
  }

  // 1. Shell Scopes (bash, sh, zsh)
  if (binaryName === 'bash' || binaryName === 'sh' || binaryName === 'zsh') {
    if (args.length < 2) {
      return { secure: false, reason: 'Shell invocation must specify a target script.' };
    }
    
    const scriptPath = args[1];
    const normalizedScript = scriptPath.replace(/^\.\//, ''); // Normalize relative prefix
    
    const allowedScripts = [
      'scripts/sandbox-execute.sh',
      'scripts/ci-verify.sh',
      'scripts/bootstrap.sh',
      'scripts/setup-git-hooks.sh',
      'scripts/ham-drift-watcher.sh'
    ];

    if (!allowedScripts.includes(normalizedScript)) {
      return {
        secure: false,
        reason: `Shell script execution blocked. Script '${scriptPath}' is not registered in the system allowlist.`
      };
    }

    // Ensure nested parameters inside sandbox-execute are also checked!
    if (normalizedScript === 'scripts/sandbox-execute.sh' && args.length > 2) {
      const nestedCmd = args[2];
      const nestedResult = isCommandLineSecure(nestedCmd);
      if (!nestedResult.secure) {
        return {
          secure: false,
          reason: `Nested sandboxed command execution rejected: ${nestedResult.reason}`
        };
      }
    }

    return { secure: true };
  }

  // 2. Package Manager Scope (npm)
  if (binaryName === 'npm') {
    if (args.length < 2) {
      return { secure: false, reason: 'npm invocation must specify an operation command.' };
    }

    const npmCommand = args[1];

    // Restrict dynamic package downloads
    if (['install', 'i', 'add', 'update', 'upgrade'].includes(npmCommand)) {
      if (args.length > 2) {
        return {
          secure: false,
          reason: 'Dynamic package installation is forbidden at runtime to prevent supply chain contamination.'
        };
      }
    }

    // Restrict allowed run scripts
    if (npmCommand === 'run') {
      if (args.length < 3) {
        return { secure: false, reason: 'npm run invocation must specify a script target name.' };
      }
      
      const scriptTarget = args[2];
      const allowedRunScripts = ['build', 'dev', 'test', 'lint', 'bootstrap', 'sandbox', 'ci'];
      
      if (!allowedRunScripts.includes(scriptTarget)) {
        return {
          secure: false,
          reason: `npm script target '${scriptTarget}' is not registered in the system allowlist.`
        };
      }
    }

    return { secure: true };
  }

  // 3. Node Runtime Scope (node)
  if (binaryName === 'node') {
    if (args.length < 2) {
      return { secure: false, reason: 'node invocation must specify a target script.' };
    }

    const scriptPath = args[1].replace(/^\.\//, ''); // Normalize path prefix
    const allowedNodeScripts = [
      'packages/crypto-utils/dist/index.js',
      'packages/crypto-utils/src/index.ts',
      'packages/crypto-utils/dist/index.ts'
    ];

    const isAllowed = allowedNodeScripts.some(allowed => scriptPath.endsWith(allowed));
    if (!isAllowed) {
      return {
        secure: false,
        reason: `Node script execution blocked. Script '${args[1]}' is not registered in the system allowlist.`
      };
    }

    return { secure: true };
  }

  // 4. Turbo Scope (turbo)
  if (binaryName === 'turbo') {
    if (args.length < 2) {
      return { secure: false, reason: 'turbo invocation must specify a command.' };
    }
    const turboCmd = args[1];
    if (turboCmd === 'run') {
      if (args.length < 3) {
        return { secure: false, reason: 'turbo run must specify a target task.' };
      }
      const allowedTasks = ['build', 'dev', 'test', 'lint'];
      const targetTask = args[2];
      if (!allowedTasks.includes(targetTask)) {
        return { secure: false, reason: `turbo task '${targetTask}' is not registered in the system allowlist.` };
      }
    }
    return { secure: true };
  }

  // Block any other binary
  return {
    secure: false,
    reason: `Binary '${rawBinary}' is not registered in the system's execution allowlist.`
  };
}
