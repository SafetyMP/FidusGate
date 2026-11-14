# Support

FidusGate is an open-source reference MCP policy gateway and a console for inspecting decisions and verifying signed receipts. Maintainer support is best effort; there is no paid SLA or production support commitment.

| Need | Start here |
| --- | --- |
| Try the experience without setup | [Browser-only demo](https://safetymp.github.io/FidusGate/) |
| Run the gateway-connected console | [Getting started](docs/getting-started.md) and [session/controls guide](docs/CONNECTED-CONSOLE-REDESIGN.md) |
| Understand receipts or a failing chain | [Development seed guide](docs/development-receipt-seeds.md); never reset data just to clear a failure |
| Report a bug, suggest a feature, or ask about docs | [GitHub issue forms](https://github.com/SafetyMP/FidusGate/issues/new/choose) |
| Report a security vulnerability | [Security policy](SECURITY.md); do not use a public issue |
| Contribute a change | [Contributing](CONTRIBUTING.md) |
| Find implementation details | [Documentation index](docs/README.md) |

When asking for help, say whether you are using the public demo or connected console. Include the commit/release, browser or Node/npm versions, expected behavior, and minimal synthetic reproduction. Redact tokens, bootstrap keys, signing secrets, personal data, and private request payloads from logs and screenshots.

A valid signature, an intact chain, and gateway reachability mean different things. None alone proves tool execution or production readiness. Keep the exact failing record and diagnostics for investigation rather than modifying a receipt to make it validate.
