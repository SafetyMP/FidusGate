/**
 * Production runtime profile helpers (ADR-0002 / CR-4).
 * Demo/dev profiles may omit prerequisites; production must fail closed.
 */

export type EnvLike = Record<string, string | undefined>;

export function isProductionRuntime(env: EnvLike = process.env): boolean {
  return env.FIDUSGATE_RUNTIME === 'production' || env.NODE_ENV === 'production';
}

export function isDemoRuntime(env: EnvLike = process.env): boolean {
  return !isProductionRuntime(env);
}

export class ProductionPrerequisiteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionPrerequisiteError';
  }
}

/**
 * When production runtime has an explicit Cedar daemon URL, daemon failures
 * must deny — no quiet fallback to the TS evaluator (ADR-0003).
 */
export function shouldFailClosedOnDaemonError(env: EnvLike = process.env): boolean {
  return isProductionRuntime(env) && Boolean(env.CEDAR_DAEMON_URL?.trim());
}

/**
 * Assert production prerequisites. Throws ProductionPrerequisiteError on violation.
 * Call at gateway boot when isProductionRuntime() is true.
 */
export function assertProductionPrerequisites(env: EnvLike = process.env): void {
  if (!isProductionRuntime(env)) {
    return;
  }

  if (env.DISABLE_AUTH === 'true') {
    throw new ProductionPrerequisiteError(
      'DISABLE_AUTH is forbidden when FIDUSGATE_RUNTIME/NODE_ENV is production'
    );
  }

  if (env.DISABLE_DEVOPS_GATE === 'true') {
    throw new ProductionPrerequisiteError(
      'DISABLE_DEVOPS_GATE is forbidden in production'
    );
  }

  if (!env.DATABASE_URL) {
    throw new ProductionPrerequisiteError(
      'DATABASE_URL is required in production (JSON datastore fallback forbidden)'
    );
  }

  if (env.FIDUSGATE_ALLOW_HOST_FALLBACK === 'true') {
    throw new ProductionPrerequisiteError(
      'FIDUSGATE_ALLOW_HOST_FALLBACK is forbidden in production'
    );
  }

  if (env.FIDUSGATE_ALLOW_LOCAL_KMS_FALLBACK === 'true') {
    throw new ProductionPrerequisiteError(
      'FIDUSGATE_ALLOW_LOCAL_KMS_FALLBACK is forbidden in production'
    );
  }

  // OIDC/JWKS: production requires issuer + audience (HS256 bootstrap forbidden).
  if (!env.OIDC_ISSUER || !env.OIDC_AUDIENCE) {
    throw new ProductionPrerequisiteError(
      'OIDC_ISSUER and OIDC_AUDIENCE are required in production'
    );
  }

  if (env.JWT_ALG === 'HS256' || env.ALLOW_HS256_BOOTSTRAP === 'true') {
    throw new ProductionPrerequisiteError(
      'HS256 bootstrap is forbidden in production; use OIDC/JWKS'
    );
  }

  // KMS required for signing claims in production.
  if (!env.KMS_PROVIDER && !env.GCP_KMS_KEY && !env.AWS_KMS_KEY_ID && !env.VAULT_TRANSIT_KEY) {
    throw new ProductionPrerequisiteError(
      'KMS provider configuration is required in production (no silent local key fallback)'
    );
  }
}

export function productionModeBanner(env: EnvLike = process.env): string {
  return isProductionRuntime(env) ? 'production' : 'demo';
}
