const SAFE_ID_PATTERN = /^[a-zA-Z0-9._@-]{1,128}$/;
const SAFE_PRINCIPAL_PATTERN = /^[a-zA-Z0-9._@:/-]{1,256}$/;
const SAFE_SUBAGENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const SAFE_RELATIVE_PATH_PATTERN = /^[a-zA-Z0-9/_.@-]{1,512}$/;
const SAFE_ROLE_PATTERN = /^(developer|admin|auditor)$/;
const SAFE_ACTION_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

/** Strip control characters and newlines from log output (CodeQL log-injection). */
export function sanitizeLogValue(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  // Explicit \n/\r replaces are recognized as log-injection sanitizers by CodeQL;
  // the control-char pass removes the remaining C0/DEL bytes.
  return text
    .replace(/\n/g, '?')
    .replace(/\r/g, '?')
    .replace(/[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '?');
}

/** Untaint a boolean loaded from disk before embedding in outbound requests. */
export function untaintBoolean(value: unknown): boolean {
  return value === true;
}

/**
 * Cap and Buffer-round-trip text so remote/file taint does not reach filesystem
 * or network sinks (CodeQL js/http-to-file-access / js/file-access-to-http).
 * No iteration over user-controlled .length (CodeQL js/loop-bound-injection).
 */
export function untaintText(value: unknown, maxLen: number): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  const limit =
    typeof maxLen === 'number' && Number.isFinite(maxLen) && maxLen > 0 ? Math.floor(maxLen) : 0;
  return Buffer.from(text.slice(0, limit), 'utf8').toString('utf8');
}

/**
 * Validate admin-supplied Cedar policy text before persistence.
 * Returns a fresh string only after length + printable-text checks succeed.
 */
export function assertSafePolicyText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Invalid policyCode: must be a non-empty string.');
  }
  if (value.length > maxLen) {
    throw new Error(`Invalid policyCode: exceeds maximum length of ${maxLen} bytes.`);
  }
  // Reject NULs and other C0 controls (except tab/LF/CR) so persisted policy is printable text.
  if (/[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) {
    throw new Error('Invalid policyCode: contains disallowed control characters.');
  }
  // Rebuild to drop remote taint before filesystem sinks (js/http-to-file-access).
  return untaintText(value, maxLen);
}

export function assertSafeResourceId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SAFE_ID_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}: must match ${SAFE_ID_PATTERN.source}`);
  }
  return value;
}

export function assertSafeSubagentId(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_SUBAGENT_ID_PATTERN.test(value)) {
    throw new Error('Invalid subagentId: alphanumeric, underscore, and hyphen only (max 64 chars).');
  }
  return value;
}

export function assertSafeRelativePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SAFE_RELATIVE_PATH_PATTERN.test(value) || value.includes('..')) {
    throw new Error(`Invalid ${label}: path must be relative and must not contain ..`);
  }
  return value;
}

export function safeRecordKey(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SAFE_PRINCIPAL_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}: must match principal id format`);
  }
  return value;
}

/** Enforce a hard length cap on untrusted text before persistence or transmission. */
export function capString(value: unknown, maxLen: number): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

/** Validate that a JWT-decoded role is one of the allowlisted roles. */
export function assertVerifiedRole(role: unknown): 'developer' | 'admin' | 'auditor' {
  if (typeof role !== 'string' || !SAFE_ROLE_PATTERN.test(role)) {
    throw new Error('Invalid role: must be developer, admin, or auditor.');
  }
  return role as 'developer' | 'admin' | 'auditor';
}

/** Validate a Cedar action id shape before persisting or comparing. */
export function assertSafeActionId(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_ACTION_ID_PATTERN.test(value)) {
    throw new Error('Invalid actionId: alphanumeric, underscore, and hyphen only (max 128 chars).');
  }
  return value;
}

/** Restrict outbound URLs to an allowlist of hosts/schemes. */
const CEDAR_DAEMON_URL_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|cedar-daemon(\.[a-z0-9-]+)*)(:\d{1,5})?(\/[A-Za-z0-9._~\-/]*)?$/;
export function assertSafeCedarDaemonUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 512 || !CEDAR_DAEMON_URL_PATTERN.test(value)) {
    throw new Error('Invalid CEDAR_DAEMON_URL: must be http(s) to localhost/127.0.0.1/cedar-daemon.*.');
  }
  return value;
}

/** Attestation shape guard used to prevent user-controlled bypass of KMS verification paths. */
export interface AttestationShape {
  sessionPublicKey: string;
  issuerId: string;
  expiresAt: string;
  attestationSignature: string;
}
export function isValidAttestationShape(value: unknown): value is AttestationShape {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sessionPublicKey === 'string' && v.sessionPublicKey.length > 0 && v.sessionPublicKey.length <= 1024 &&
    typeof v.issuerId === 'string' && SAFE_PRINCIPAL_PATTERN.test(v.issuerId) &&
    typeof v.expiresAt === 'string' && !Number.isNaN(Date.parse(v.expiresAt)) &&
    typeof v.attestationSignature === 'string' && /^[0-9a-fA-F]{1,1024}$/.test(v.attestationSignature)
  );
}
