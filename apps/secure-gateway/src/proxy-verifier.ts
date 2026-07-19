import * as http from 'node:http';
import * as url from 'node:url';
import { CedarEvaluator } from './cedar-evaluator';
import { sanitizeLogValue } from './security-sanitize';

export function createProxyVerifier(evaluator: CedarEvaluator) {
  return (req: http.IncomingMessage, res: http.ServerResponse, next?: () => void) => {
    const requestUrl = req.url || '';
    try {
      const parsed = url.parse(requestUrl);
      // Always evaluate Cedar — do not branch on user-controlled host shape before
      // the policy check (CodeQL js/user-controlled-bypass). Empty/malformed hosts
      // are passed as a sentinel that Cedar policies deny.
      const host = String(parsed.hostname || '').slice(0, 253);
      const resourceHost = host.length > 0 ? host : 'invalid.invalid';

      const decision = evaluator.isAuthorized(
        'mcp-agent@fidusgate.internal',
        'outbound_connect',
        { host: resourceHost }
      );

      if (decision === 'allow') {
        if (next) next();
        return;
      }

      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Egress Blocked by FidusGate proxy-verifier',
        message: `Outbound connection to domain '${sanitizeLogValue(resourceHost)}' is not allowed under current Cedar rules.`
      }));
    } catch (e: any) {
      console.error('[proxy-verifier] Egress evaluation exception:', sanitizeLogValue(e?.message ?? String(e)));
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Proxy Verification Error',
        message: 'Egress evaluation failed. See server logs for details.'
      }));
    }
  };
}
