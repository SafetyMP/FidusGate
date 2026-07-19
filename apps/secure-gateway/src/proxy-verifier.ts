import * as http from 'node:http';
import * as url from 'node:url';
import { CedarEvaluator } from './cedar-evaluator';
import { sanitizeLogValue } from './security-sanitize';

export function createProxyVerifier(evaluator: CedarEvaluator) {
  return (req: http.IncomingMessage, res: http.ServerResponse, next?: () => void) => {
    const requestUrl = req.url || '';
    try {
      const parsed = url.parse(requestUrl);
      const host = parsed.host || parsed.hostname || '';

      // Fail closed on missing / unparseable host; user-controlled URL must not bypass Cedar.
      if (!host || typeof host !== 'string' || host.length === 0 || host.length > 253) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: 'Egress Blocked by FidusGate proxy-verifier',
          message: 'Outbound request rejected: missing or malformed host.'
        }));
        return;
      }

      const decision = evaluator.isAuthorized(
        'mcp-agent@fidusgate.internal',
        'outbound_connect',
        { host }
      );

      if (decision === 'allow') {
        if (next) next();
        return;
      }

      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Egress Blocked by FidusGate proxy-verifier',
        message: `Outbound connection to domain '${sanitizeLogValue(host)}' is not allowed under current Cedar rules.`
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
