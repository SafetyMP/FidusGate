import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import jwt from 'jsonwebtoken';

export type RuntimeEnvironment = NodeJS.ProcessEnv;

/** Well-known secrets that must never be accepted — including the former hardcoded default. */
export const INSECURE_JWT_SECRETS = new Set([
  'fidusgate-dev-jwt-secret-local-only',
  'secret',
  'changeme',
  'password',
  'jwt-secret',
]);

export interface AuthenticatedClaims {
  id: string;
  role: 'developer' | 'admin' | 'auditor';
  email: string;
}

export function isProductionRuntime(env: RuntimeEnvironment = process.env): boolean {
  return env.NODE_ENV === 'production' || env.FIDUSGATE_RUNTIME === 'production';
}

/**
 * The legacy HS256/bootstrap flow exists only to support local demos. Refuse to
 * start a production-marked process while any part of that flow is configured.
 * This prevents an accidental production deployment from silently accepting a
 * demo identity until the OIDC BFF/JWKS implementation replaces it.
 */
export function assertProductionAuthConfiguration(env: RuntimeEnvironment = process.env): void {
  if (!isProductionRuntime(env)) return;

  const invalidSettings: string[] = [];
  if (env.DISABLE_AUTH === 'true') invalidSettings.push('DISABLE_AUTH=true');
  if (env.JWT_SECRET) invalidSettings.push('JWT_SECRET (legacy HS256 verifier)');
  if (env.FIDUSGATE_BOOTSTRAP_KEY) invalidSettings.push('FIDUSGATE_BOOTSTRAP_KEY (legacy token minter)');

  if (invalidSettings.length > 0) {
    throw new Error(
      `Production authentication startup denied: ${invalidSettings.join(', ')} is demo-only. ` +
        'Configure the OIDC BFF and JWKS verifier instead.'
    );
  }

  const missingOidc = ['FIDUSGATE_OIDC_ISSUER', 'FIDUSGATE_OIDC_AUDIENCE', 'FIDUSGATE_JWKS_URL'].filter(
    (name) => !env[name]?.trim()
  );
  if (missingOidc.length > 0) {
    throw new Error(
      `Production authentication startup denied: missing required OIDC/JWKS configuration: ${missingOidc.join(', ')}.`
    );
  }

  // The current request middleware is intentionally restricted to the legacy
  // HS256 demo verifier. Do not let a production marker make that path live
  // merely because OIDC variables were populated.
  throw new Error(
    'Production authentication startup denied: the OIDC BFF/JWKS verifier is not installed; legacy HS256 is unavailable in production.'
  );
}

/**
 * Resolve the HS256 demo JWT secret for non-production runtimes.
 * Never returns a well-known hardcoded default. If JWT_SECRET is unset, mint a
 * per-checkout secret under dataDir (gitignored) so offline forging against a
 * public constant is impossible.
 */
export function resolveJwtSecret(
  env: RuntimeEnvironment = process.env,
  options?: { dataDir?: string }
): string {
  if (isProductionRuntime(env)) {
    throw new Error(
      'JWT_SECRET resolution is unavailable in production; configure the OIDC BFF/JWKS verifier instead.'
    );
  }

  const fromEnv = env.JWT_SECRET?.trim();
  if (fromEnv) {
    if (INSECURE_JWT_SECRETS.has(fromEnv)) {
      throw new Error(
        'JWT_SECRET matches a well-known insecure default. Set a unique secret of at least 32 characters.'
      );
    }
    if (fromEnv.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters.');
    }
    return fromEnv;
  }

  const dataDir = options?.dataDir || path.resolve(process.cwd(), 'packages/database/data');
  // Keep the `.json` suffix so packages/database/data/*.json gitignore applies.
  const secretPath = path.join(dataDir, 'jwt-dev-secret.json');
  try {
    const existing = fs.readFileSync(secretPath, 'utf8').trim();
    if (existing.length >= 32 && !INSECURE_JWT_SECRETS.has(existing)) {
      return existing;
    }
  } catch (err: any) {
    if (err && err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
      throw err;
    }
  }

  const generated = crypto.randomBytes(48).toString('base64url');
  fs.mkdirSync(dataDir, { recursive: true });
  const tempPath = `${secretPath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tempPath, `${generated}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  fs.renameSync(tempPath, secretPath);
  try {
    fs.chmodSync(secretPath, 0o600);
  } catch {
    // Best-effort on platforms without POSIX modes.
  }
  console.warn(
    '[auth] JWT_SECRET unset — generated a per-checkout secret at packages/database/data/jwt-dev-secret.json. ' +
      'Set JWT_SECRET explicitly for shared/staging environments.'
  );
  return generated;
}

export function verifyLegacyBearerAuthorization(
  authorization: unknown,
  secret: string,
  expectedAudience?: string
): AuthenticatedClaims {
  if (typeof authorization !== 'string' || !/^Bearer\s+\S+$/i.test(authorization)) {
    throw new Error('Missing bearer authorization');
  }

  const token = authorization.replace(/^Bearer\s+/i, '');
  const decoded = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    ...(expectedAudience ? { audience: expectedAudience } : {}),
  }) as jwt.JwtPayload;

  const role = decoded.role;
  if (role !== 'developer' && role !== 'admin' && role !== 'auditor') {
    throw new Error('Invalid authenticated role');
  }
  if (typeof decoded.sub !== 'string' || typeof decoded.email !== 'string') {
    throw new Error('Missing required authenticated claims');
  }

  return { id: decoded.sub, role, email: decoded.email };
}
