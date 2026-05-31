/**
 * 🕵️ FidusGate SecOps Consensus Command Auditor
 * Evaluates the safety and threat risk of proposed consensus commands.
 */

export interface AuditResult {
  rating: 'safe' | 'suspicious' | 'dangerous';
  reason: string;
}

export function auditConsensusRequest(command: string): AuditResult {
  if (!command || typeof command !== 'string') {
    return { rating: 'safe', reason: 'No command specified.' };
  }

  const cmdLower = command.toLowerCase().trim();

  // 1. Dangerous Commands (Destructive or Privilege Escaping)
  const dangerousPatterns = [
    { pattern: /rm\s+-rf/i, reason: 'Destructive recursive directory deletion attempt.' },
    { pattern: /curl\s+/i, reason: 'Arbitrary remote package or script download.' },
    { pattern: /wget\s+/i, reason: 'Arbitrary remote package or script download.' },
    { pattern: /chmod\s+777/i, reason: 'Dangerous wildcard directory permission escalation.' },
    { pattern: /chown\s+root/i, reason: 'Direct root owner modification attempt.' },
    { pattern: /npm\s+install\s+/i, reason: 'Dynamic third-party package installation bypasses auditor rules.' },
    { pattern: /pip\s+install\s+/i, reason: 'Dynamic third-party package installation bypasses auditor rules.' },
    { pattern: /\/etc\//i, reason: 'Access attempt to sensitive system configuration directories.' },
    { pattern: /mv\s+.*policy\.cedar/i, reason: 'Direct manipulation of active Cedar policies.' },
    { pattern: /ssh\s+/i, reason: 'Outbound remote access shell connection.' }
  ];

  for (const item of dangerousPatterns) {
    if (item.pattern.test(cmdLower)) {
      return {
        rating: 'dangerous',
        reason: `AI Auditor critical threat detected: ${item.reason}`
      };
    }
  }

  // 2. Suspicious Commands (Requires caution or SME oversight)
  const suspiciousPatterns = [
    { pattern: /bootstrap\.sh/i, reason: 'Modifying system environment configuration.' },
    { pattern: /replace_file_content/i, reason: 'Inline file modification script execution.' },
    { pattern: /\.env/i, reason: 'Access attempt to environment credential parameters.' },
    { pattern: /git\s+reset/i, reason: 'Altering active workspace history.' }
  ];

  for (const item of suspiciousPatterns) {
    if (item.pattern.test(cmdLower)) {
      return {
        rating: 'suspicious',
        reason: `AI Auditor advisory: ${item.reason} manual oversight recommended.`
      };
    }
  }

  // 3. Safe Commands
  return {
    rating: 'safe',
    reason: 'AI Auditor passed: standard developer toolchain command execution.'
  };
}
