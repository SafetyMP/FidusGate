import jwt from 'jsonwebtoken';

export type RuntimeEnvironment = NodeJS.ProcessEnv;

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
