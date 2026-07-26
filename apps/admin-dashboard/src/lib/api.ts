export const API_BASE = '/api';

export type AuthRole = 'developer' | 'admin' | 'auditor' | 'unauthenticated';

export function buildAuthHeaders(authToken: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
}

export function assertSafeResourceId(value: string, label: string): string {
  const SAFE_RESOURCE_ID = /^[a-zA-Z0-9._@-]{1,128}$/;
  if (!SAFE_RESOURCE_ID.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}
