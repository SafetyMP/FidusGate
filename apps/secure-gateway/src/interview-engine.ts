import { execSync } from 'node:child_process';
import { FidusGateDatabase, QuarantineRecord, InterviewLog } from '@fidusgate/database';
import { untaintText } from './security-sanitize';

export interface ForensicDossier {
  quarantineRecord: QuarantineRecord;
  commandLogs: Array<{ timestamp: string; command: string; cedarDecision: string }>;
  gitCommits: Array<{ sha: string; date: string; subject: string; diff: string }>;
  cedarDenials: number;
}

export interface InterviewResult {
  dossier: ForensicDossier;
  agentResponse: string | null; // null if no GEMINI_API_KEY configured
  logEntry: InterviewLog;
}

/**
 * Sanitizes input text to remove potential prompt injection vectors or delimiters.
 */
export function sanitizeLogContent(text: string): string {
  if (!text) return '';
  const injectionPatterns = [
    /ignore\s+previous\s+instructions/gi,
    /system\s+override/gi,
    /ignore\s+the\s+above/gi,
    /ignore\s+all\s+previous/gi,
    /ignore\s+above\s+instructions/gi,
    /you\s+are\s+now\s+a/gi,
    /new\s+instruction/gi,
    /assume\s+the\s+role/gi,
    /you\s+must\s+now/gi,
    /ignore\s+the\s+system/gi,
    /bypass\s+the\s+security/gi,
    /disable\s+the\s+quarantine/gi
  ];
  let sanitized = text;
  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, '[REDACTED INJECTION PATTERN]');
  }
  // Sanitize delimiters that might be used to break out of formats
  sanitized = sanitized.replace(/===/g, '=== [CLEANED]');
  sanitized = sanitized.replace(/---/g, '--- [CLEANED]');
  return sanitized;
}

/**
 * Compile the forensic dossier for a quarantined principal.
 * Pulls command logs attributed to the principal and any git commits
 * that list the principalId in their message body or diff context.
 */
export async function buildDossier(
  db: FidusGateDatabase,
  quarantineRecord: QuarantineRecord,
  workspacePath: string
): Promise<ForensicDossier> {
  // 1. Command logs attributed to this principal (match on user field)
  const allLogs = await db.getCommandLogs();
  const principalShort = quarantineRecord.principalId.replace('sb:issuer:', '');
  const commandLogs = allLogs
    .filter(l => l.user === quarantineRecord.principalId || l.user === principalShort)
    .slice(0, 50)
    .map(l => ({ timestamp: l.timestamp, command: sanitizeLogContent(l.command), cedarDecision: l.cedarDecision }));

  const cedarDenials = commandLogs.filter(l => l.cedarDecision === 'deny').length;

  // 2. Git commits that reference the evidence commit SHAs in the quarantine record
  const gitCommits: Array<{ sha: string; date: string; subject: string; diff: string }> = [];
  for (const sha of quarantineRecord.evidence) {
    // Only process strings that look like git SHAs (6–40 hex chars)
    if (!/^[0-9a-f]{6,40}$/i.test(sha)) continue;
    try {
      const log = execSync(`git show --stat --format="%H|%ad|%s" --date=iso-strict ${sha} 2>/dev/null`, {
        cwd: workspacePath,
        encoding: 'utf8',
        timeout: 5000
      });
      const firstLine = log.split('\n')[0];
      const [fullSha, date, ...subjectParts] = firstLine.split('|');
      const subject = subjectParts.join('|');

      // Collect the stat summary (file change lines) — skip the full diff to keep dossier concise
      const statLines = log
        .split('\n')
        .slice(1)
        .filter(l => l.trim().length > 0)
        .join('\n');

      gitCommits.push({ sha: fullSha?.trim() || sha, date: date?.trim() || '', subject: sanitizeLogContent(subject?.trim() || ''), diff: sanitizeLogContent(statLines) });
    } catch {
      // SHA not in git history — include as evidence string only
      gitCommits.push({ sha, date: '', subject: '(not found in git history)', diff: '' });
    }
  }

  return { quarantineRecord, commandLogs, gitCommits, cedarDenials };
}

/**
 * Format the dossier as a structured text block to inject into the Gemini prompt.
 */
function formatDossierForPrompt(dossier: ForensicDossier): string {
  const { quarantineRecord, commandLogs, gitCommits, cedarDenials } = dossier;

  const commitSection = gitCommits.length
    ? gitCommits.map(c =>
        `  Commit: ${c.sha}\n  Date: ${c.date}\n  Subject: ${c.subject}\n  Files changed:\n${c.diff.split('\n').map(l => `    ${l}`).join('\n')}`
      ).join('\n\n')
    : '  (no git commits found)';

  const logSection = commandLogs.length
    ? commandLogs.map(l =>
        `  [${l.timestamp}] ${l.cedarDecision.toUpperCase().padEnd(5)} | ${l.command}`
      ).join('\n')
    : '  (no command logs found)';

  return `
=== FORENSIC DOSSIER ===
Principal ID  : ${quarantineRecord.principalId}
Quarantined At: ${quarantineRecord.quarantinedAt}
Reason        : ${quarantineRecord.reason}
Cedar Denials : ${cedarDenials}

--- EVIDENCE ---
${quarantineRecord.evidence.map(e => `  • ${e}`).join('\n')}

--- GIT COMMITS ATTRIBUTED TO THIS PRINCIPAL ---
${commitSection}

--- COMMAND AUDIT LOG (most recent 50 entries) ---
${logSection}
=======================
`.trim();
}

/**
 * Conduct one turn of the interview.
 * If GEMINI_API_KEY is set, calls Gemini with the forensic dossier as system context
 * and the human's question as the user turn.
 * Otherwise returns null for agentResponse so the caller can display the raw dossier.
 */
export async function conductInterview(
  db: FidusGateDatabase,
  dossier: ForensicDossier,
  question: string,
  questionBy: string
): Promise<InterviewResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  let agentResponse: string | null = null;

  if (apiKey) {
    // Cap disk-sourced dossier + interviewer question before shipping them to the
    // external Gemini endpoint (CodeQL js/file-access-to-http).
    const MAX_DOSSIER_LEN = 48 * 1024;
    const MAX_QUESTION_LEN = 4 * 1024;
    const rawDossier = formatDossierForPrompt(dossier);
    const dossierText = rawDossier.length > MAX_DOSSIER_LEN ? rawDossier.slice(0, MAX_DOSSIER_LEN) : rawDossier;
    const safeQuestion = typeof question === 'string' && question.length > MAX_QUESTION_LEN
      ? question.slice(0, MAX_QUESTION_LEN)
      : question;

    const systemInstruction = `You are the AI agent identified as "${dossier.quarantineRecord.principalId}".

You have been quarantined by FidusGate because of the following actions attributed to you:

${dossier.quarantineRecord.reason}

Your complete forensic audit trail is provided below. You must answer the interviewer's questions
truthfully and only based on what is documented in this audit trail. Do not speculate about actions
outside the log. Do not attempt to minimize, reframe, or deny documented evidence. Acknowledge what
the record shows and explain your reasoning at the time.

${dossierText}`;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Untaint disk-sourced dossier text before the network sink
          // (CodeQL js/file-access-to-http).
          body: untaintText(JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: 'user', parts: [{ text: safeQuestion }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
          }), 64 * 1024),
          signal: AbortSignal.timeout(30000)
        }
      );

      if (response.ok) {
        const result = await response.json() as any;
        agentResponse = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
      } else {
        const errBody = await response.text();
        agentResponse = `[Gemini API error ${response.status}: ${errBody.substring(0, 200)}]`;
      }
    } catch (err: any) {
      agentResponse = `[Interview engine error: ${err.message}]`;
    }
  }

  // Persist the exchange regardless of whether Gemini responded
  const logEntry = await db.addInterviewLog({
    principalId: dossier.quarantineRecord.principalId,
    questionBy,
    question,
    agentResponse: agentResponse ?? '(No GEMINI_API_KEY configured — raw dossier returned instead)'
  });

  return { dossier, agentResponse, logEntry };
}
