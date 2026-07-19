import * as crypto from "node:crypto";

export const PUBLIC_KEY_MAP: Record<string, string> = {
  "sb:issuer:de073ae64e43":
    "302a300506032b6570032100df20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de83",
  "sb:issuer:pm-sme":
    "302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de81",
  "sb:issuer:architecture-sme":
    "302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de82",
  "sb:issuer:backend-sme":
    "302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de83",
  "sb:issuer:frontend-sme":
    "302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de84",
  "sb:issuer:qa-sme":
    "302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de85",
  "sb:issuer:security-sme":
    "302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de86",
  "sb:issuer:devops-sme":
    "302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de87",
};

export function verifyAuthorizePrincipalSignature(
  principal: string,
  toolName: string,
  args: Record<string, unknown> | undefined,
  signatureHex: string | undefined,
): boolean {
  if (!principal || !principal.startsWith("sb:issuer:")) {
    return true;
  }
  const publicKeyHex = PUBLIC_KEY_MAP[principal];
  if (!publicKeyHex) {
    return false;
  }
  if (!signatureHex) {
    return false;
  }
  try {
    const payload = {
      principal,
      tool: toolName,
      args: {
        path: typeof args?.path === "string" ? args.path : "",
        commandLine: typeof args?.commandLine === "string" ? args.commandLine : "",
      },
    };
    const data = Buffer.from(JSON.stringify(payload));
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(publicKeyHex, "hex"),
      format: "der",
      type: "spki",
    });
    const signature = Buffer.from(signatureHex, "hex");
    return crypto.verify(null, data, publicKey, signature);
  } catch {
    return false;
  }
}

const POLICY_GODMODE_PATTERNS = [
  /principal\s*==\s*"sb:issuer:de073ae64e43"/,
  /!\(\s*principal\s*==\s*"sb:issuer:de073ae64e43"/,
];

const MAX_POLICY_CODE_LEN = 128 * 1024;

/**
 * Linear scan for a `permit ( ... principal == "sb:issuer:...` fragment.
 * Replaces the previous /permit\s*\([\s\S]*principal\s*==\s*"sb:issuer:/ regex,
 * which had a nested quantifier and was flagged as ReDoS
 * (CodeQL js/polynomial-redos).
 */
function containsPrivilegedPermit(policyCode: string): boolean {
  let idx = 0;
  while (idx < policyCode.length) {
    const permitIdx = policyCode.indexOf('permit', idx);
    if (permitIdx < 0) return false;
    // Look for the opening paren immediately after (optionally through whitespace)
    let cursor = permitIdx + 'permit'.length;
    while (cursor < policyCode.length && (policyCode[cursor] === ' ' || policyCode[cursor] === '\t')) {
      cursor++;
    }
    if (policyCode[cursor] === '(') {
      const closeIdx = policyCode.indexOf(')', cursor);
      if (closeIdx > cursor) {
        const inside = policyCode.slice(cursor + 1, closeIdx);
        if (inside.includes('principal') && inside.includes('sb:issuer:')) {
          return true;
        }
      }
    }
    idx = permitIdx + 'permit'.length;
  }
  return false;
}

export function policyCodePassesSafetyChecks(policyCode: string): { ok: true } | { ok: false; reason: string } {
  if (typeof policyCode !== 'string') {
    return { ok: false, reason: 'Policy code must be a string.' };
  }
  if (policyCode.length > MAX_POLICY_CODE_LEN) {
    return { ok: false, reason: `Policy code exceeds maximum length of ${MAX_POLICY_CODE_LEN} characters.` };
  }
  for (const pattern of POLICY_GODMODE_PATTERNS) {
    if (pattern.test(policyCode)) {
      return { ok: false, reason: "Policy must not contain hardcoded god-mode principal exceptions." };
    }
  }
  if (containsPrivilegedPermit(policyCode) && !policyCode.includes('signature')) {
    return { ok: false, reason: "Privileged principal permits require signature attestation in policy comments." };
  }
  return { ok: true };
}
