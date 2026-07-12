const SAFE_ID_PATTERN = /^[a-zA-Z0-9._@-]{1,128}$/;
const SAFE_PRINCIPAL_PATTERN = /^[a-zA-Z0-9._@:/-]{1,256}$/;
const SAFE_SUBAGENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const SAFE_RELATIVE_PATH_PATTERN = /^[a-zA-Z0-9/_.@-]{1,512}$/;

/** Strip control characters and newlines from log output (CodeQL log-injection). */
export function sanitizeLogValue(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.replace(/[\0-\x1f\x7f]/g, '?');
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
