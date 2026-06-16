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

export interface SuggestedAutofix {
  target: string;
  replacement: string;
}

export interface AuditResult {
  secure: boolean;
  reason?: string;
  remediationSuggestion?: string;
  suggestedAutofix?: SuggestedAutofix;
}

/**
 * Audits a tokenized command line against a strict, zero-trust binary allowlist schema.
 */
export function isCommandLineSecure(commandLine: string): AuditResult {
  const cleanCmd = commandLine.trim();
  if (cleanCmd.length === 0) {
    return { 
      secure: false, 
      reason: 'Command line is empty.',
      remediationSuggestion: 'Ensure a valid non-empty utility or shell script path is specified.'
    };
  }

  // Global block on shell chaining and redirection to prevent host escapes
  const forbiddenChars = [';', '|', '>', '<', '`', '&'];
  for (const char of forbiddenChars) {
    if (cleanCmd.includes(char)) {
      return {
        secure: false,
        reason: `Command line contains forbidden shell character '${char}' to prevent chaining or redirection.`,
        remediationSuggestion: `Avoid shell chaining operators ('${char}'). Execute commands as individual steps or wrap custom logic inside 'scripts/sandbox-execute.sh'.`
      };
    }
  }
  if (cleanCmd.includes('$(')) {
    return {
      secure: false,
      reason: "Command line contains forbidden subshell execution '$('.",
      remediationSuggestion: "Subshell execution ('$(') is globally blocked. Pass static parameters or define variables inside a pre-approved script."
    };
  }

  const args = parseShellCommand(cleanCmd);
  if (args.length === 0) {
    return { 
      secure: false, 
      reason: 'Parsed command arguments array is empty.',
      remediationSuggestion: 'Format command tokens using standard shell spacing rules.'
    };
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
    let suggestion = "Dynamic host-level execution of compilers and network tools is globally blocked.";
    let fix: SuggestedAutofix | undefined = undefined;
    
    if (binaryName === 'curl' || binaryName === 'wget') {
      suggestion = "Network downloads via curl/wget are forbidden. Retrieve dependencies via pre-approved package files or utilize the secure proxy gateway.";
    } else if (['pip', 'pip3', 'python', 'python3', 'go', 'cargo', 'rustc'].includes(binaryName)) {
      suggestion = `Dynamic compilation with '${binaryName}' is blocked on the host. Please execute tool chains inside the sandboxed overlay via 'scripts/sandbox-execute.sh "${cleanCmd.replace(/"/g, '\\"')}"'.`;
      fix = {
        target: cleanCmd,
        replacement: `bash scripts/sandbox-execute.sh "${cleanCmd.replace(/"/g, '\\"')}" "${process.cwd()}"`
      };
    }
    
    return {
      secure: false,
      reason: `Binary '${binaryName}' is explicitly forbidden to prevent network downloads and unauthorized compilation.`,
      remediationSuggestion: suggestion,
      suggestedAutofix: fix
    };
  }

  // 1. Shell Scopes (bash, sh, zsh)
  if (binaryName === 'bash' || binaryName === 'sh' || binaryName === 'zsh') {
    if (args.length < 2) {
      return { 
        secure: false, 
        reason: 'Shell invocation must specify a target script.',
        remediationSuggestion: 'Usage syntax: sh <script_path> [arguments]'
      };
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
        reason: `Shell script execution blocked. Script '${scriptPath}' is not registered in the system allowlist.`,
        remediationSuggestion: `Only allowlisted system scripts (e.g. scripts/sandbox-execute.sh) can run natively. Wrap custom scripts inside a sandbox run.`
      };
    }

    // Ensure nested parameters inside sandbox-execute are also checked!
    if (normalizedScript === 'scripts/sandbox-execute.sh' && args.length > 2) {
      const nestedCmd = args[2];
      const nestedResult = isCommandLineSecure(nestedCmd);
      if (!nestedResult.secure) {
        return {
          secure: false,
          reason: `Nested sandboxed command execution rejected: ${nestedResult.reason}`,
          remediationSuggestion: nestedResult.remediationSuggestion
        };
      }
    }

    return { secure: true };
  }

  // 2. Package Manager Scope (npm)
  if (binaryName === 'npm') {
    if (args.length < 2) {
      return { 
        secure: false, 
        reason: 'npm invocation must specify an operation command.',
        remediationSuggestion: 'Specify a valid npm lifecycle command: npm run <script> or npm install.'
      };
    }

    const npmCommand = args[1];

    // Restrict dynamic package downloads
    if (['install', 'i', 'add', 'update', 'upgrade'].includes(npmCommand)) {
      const packageArgs = args.slice(2).filter(arg => !arg.startsWith('-'));
      if (packageArgs.length > 0) {
        return {
          secure: false,
          reason: 'Dynamic package installation is forbidden at runtime to prevent supply chain contamination.',
          remediationSuggestion: 'Add new dependencies inside the root package.json file first, then run standard workspace bootstraps.',
          suggestedAutofix: {
            target: cleanCmd,
            replacement: 'npm run bootstrap'
          }
        };
      }
    }

    // Enforce --ignore-scripts to prevent package lifecycle hook execution
    const isSafeRunScript = npmCommand === 'run' && (args[2] === 'memory:context' || args[2] === 'policy:dry-run');
    if (!args.includes('--ignore-scripts') && !isSafeRunScript) {
      return {
        secure: false,
        reason: "npm commands must include the '--ignore-scripts' flag to prevent execution of un-vetted lifecycle scripts.",
        remediationSuggestion: "Append '--ignore-scripts' to your npm command line.",
        suggestedAutofix: {
          target: cleanCmd,
          replacement: cleanCmd + ' --ignore-scripts'
        }
      };
    }

    // Restrict allowed run scripts
    if (npmCommand === 'run') {
      if (args.length < 3) {
        return { 
          secure: false, 
          reason: 'npm run invocation must specify a script target name.',
          remediationSuggestion: 'Usage syntax: npm run <build|test|lint|ci|bootstrap|sandbox>'
        };
      }
      
      const scriptTarget = args[2];
      const allowedRunScripts = ['build', 'dev', 'test', 'lint', 'bootstrap', 'sandbox', 'ci', 'memory:context', 'policy:dry-run'];
      
      if (!allowedRunScripts.includes(scriptTarget)) {
        return {
          secure: false,
          reason: `npm script target '${scriptTarget}' is not registered in the system allowlist.`,
          remediationSuggestion: `Only registered workspace commands are permitted: [${allowedRunScripts.join(', ')}].`
        };
      }
    }

    return { secure: true };
  }

  // 3. Node Runtime Scope (node)
  if (binaryName === 'node') {
    if (args.length < 2) {
      return { 
        secure: false, 
        reason: 'node invocation must specify a target script.',
        remediationSuggestion: 'Usage syntax: node <allowlisted_script_path>'
      };
    }

    const scriptPath = args[1].replace(/^\.\//, ''); // Normalize path prefix
    const allowedNodeScripts = [
      'packages/crypto-utils/dist/index.js',
      'packages/crypto-utils/src/index.ts',
      'packages/crypto-utils/dist/index.ts',
      'scripts/workflow-scanner.js'
    ];

    const isAllowed = allowedNodeScripts.some(allowed => scriptPath.endsWith(allowed));
    if (!isAllowed) {
      return {
        secure: false,
        reason: `Node script execution blocked. Script '${args[1]}' is not registered in the system allowlist.`,
        remediationSuggestion: 'Only native cryptography and CI workflow scanning modules can be executed directly by the Node engine.'
      };
    }

    return { secure: true };
  }

  // 4. Turbo Scope (turbo)
  if (binaryName === 'turbo') {
    if (args.length < 2) {
      return { 
        secure: false, 
        reason: 'turbo invocation must specify a command.',
        remediationSuggestion: 'Usage syntax: turbo run <task_name>'
      };
    }
    const turboCmd = args[1];
    if (turboCmd === 'run') {
      if (args.length < 3) {
        return { 
          secure: false, 
          reason: 'turbo run must specify a target task.',
          remediationSuggestion: 'Specify a pre-configured turbo task target: [build, dev, test, lint]'
        };
      }
      const allowedTasks = ['build', 'dev', 'test', 'lint'];
      const targetTask = args[2];
      if (!allowedTasks.includes(targetTask)) {
        return { 
          secure: false, 
          reason: `turbo task '${targetTask}' is not registered in the system allowlist.`,
          remediationSuggestion: `Only allowlisted turbo tasks can run: [${allowedTasks.join(', ')}]`
        };
      }
    }
    return { secure: true };
  }

  // Block any other binary
  return {
    secure: false,
    reason: `Binary '${rawBinary}' is not registered in the system's execution allowlist.`,
    remediationSuggestion: "Only standard workflow tooling (npm, turbo, node) and allowlisted system shell scripts are allowed natively."
  };
}
