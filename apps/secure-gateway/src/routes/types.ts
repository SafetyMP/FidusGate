import type { FidusGateDatabase } from '@fidusgate/database';
import type express from 'express';

export type AuthRole = 'developer' | 'admin' | 'auditor';

export interface AuthenticatedRequest extends express.Request {
  user?: {
    id: string;
    role: AuthRole;
    email: string;
  };
  agentPrincipal?: string;
}

export type RequireAuth = (
  allowedRoles: AuthRole[],
  options?: { mcpResource?: boolean },
) => express.RequestHandler;

export type LogFn = (
  level: 'info' | 'warn' | 'error' | 'security',
  message: string,
  meta?: unknown,
) => void;

export interface CoreRouteDeps {
  db: FidusGateDatabase;
  requireAuth: RequireAuth;
  log: LogFn;
  secureNumericId: (digits: number) => string;
}
