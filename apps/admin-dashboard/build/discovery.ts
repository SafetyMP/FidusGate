import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

export const DEMO_URL = 'https://safetymp.github.io/FidusGate/';
export const REPOSITORY_URL = 'https://github.com/SafetyMP/FidusGate';
const description =
  'A scheduling fix is on hold. Help a release lead check a forwarded permission claim using the gateway’s signed decision and independent file history in this demo with synthetic data.';

/** Static, source-controlled metadata. No receipt, session, or request data is interpolated. */
export function discoveryContent(isDemo: boolean): { metadata: string; overview: string } {
  if (!isDemo) {
    return {
      metadata: `<title>FidusGate — Gateway-connected console</title>
    <meta name="description" content="Inspect gateway tool-call decisions and verify signed receipts in the FidusGate connected console." />
    <meta name="robots" content="noindex, nofollow" />`,
      overview: `<main><h1>FidusGate gateway-connected console</h1>
      <p>Inspect gateway tool-call decisions and verify signed receipts. JavaScript and a configured gateway are required.</p>
      <p><a href="${REPOSITORY_URL}/blob/main/docs/getting-started.md">Local setup guide</a></p></main>`,
    };
  }

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': DEMO_URL,
    url: DEMO_URL,
    name: 'FidusGate — FG-1048 change-review case demo',
    description,
    inLanguage: 'en',
    about: {
      '@type': 'SoftwareSourceCode',
      name: 'FidusGate',
      codeRepository: REPOSITORY_URL,
      url: REPOSITORY_URL,
      license: 'https://www.apache.org/licenses/LICENSE-2.0',
      programmingLanguage: ['TypeScript', 'Rust'],
      description:
        'Reference MCP policy gateway with Cedar authorization, Ed25519-signed receipts, and a receipt-first console. Not a production-hardened security product.',
    },
  };

  return {
    metadata: `<title>FidusGate — FG-1048 change-review case demo</title>
    <meta name="description" content="${description}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${DEMO_URL}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="FidusGate" />
    <meta property="og:title" content="FidusGate — Can the customer fix ship today?" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${DEMO_URL}" />
    <meta property="og:image" content="${DEMO_URL}social-preview.png" />
    <meta property="og:image:width" content="1440" />
    <meta property="og:image:height" content="900" />
    <meta property="og:image:alt" content="FG-1048 change-review case showing the scheduling problem and how FidusGate checks permission, signs a receipt and verifies the copy." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="FidusGate — The disputed policy write" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${DEMO_URL}social-preview.png" />
    <meta name="twitter:image:alt" content="FG-1048 change-review case showing the scheduling problem and how FidusGate checks permission, signs a receipt and verifies the copy." />
    <script type="application/ld+json">${JSON.stringify(structuredData)}</script>`,
    overview: `<main>
      <h1>Can the customer fix ship today?</h1>
      <p>Dispatchers are checking duplicate appointments by hand. A fix is ready, but the release lead needs to establish what a coding assistant was allowed to change. Try forwarding the ticket, then compare it with the gateway original and follow the file history.</p>
      <p>FidusGate is an open-source reference Model Context Protocol (MCP) gateway with Cedar authorization, Ed25519-signed receipts, and a receipt-first console.</p>
      <h2>Explore the FG-1048 case</h2>
      <p>The FG-1048 case asks an analyst to investigate a disputed policy write and a platform security lead to choose between existing logs, a standard export and a signed-receipt pilot. Follow the selected packet into the technical evidence to compare signed fixtures. The investigation requires JavaScript.</p>
      <p>This browser-only demo uses synthetic records and a public demo key. It does not connect an agent, evaluate Cedar, or execute tools. Receipt input stays in your browser. A valid signature does not establish issuer trust or prove execution. FidusGate is not a production-hardened security product.</p>
      <p><a href="${DEMO_URL}#/case">Business case</a> · <a href="${DEMO_URL}#/technical?packet=received&amp;fixture=FG-1048&amp;stage=signature">Selected packet and signature evidence</a></p>
      <h2>Run the gateway-connected console</h2>
      <p>The connected console uses gateway records and role-scoped development sessions. It includes Decisions, Policy playground, Receipt verifier, Transactions, Governance, Forensics, and Sandbox workspaces.</p>
      <ul>
        <li><a href="${REPOSITORY_URL}">Source code and project overview</a></li>
        <li><a href="${REPOSITORY_URL}/blob/main/docs/getting-started.md">Local setup guide</a></li>
        <li><a href="${REPOSITORY_URL}/blob/main/docs/README.md">Documentation</a></li>
        <li><a href="${REPOSITORY_URL}/blob/main/SECURITY.md">Security scope and vulnerability reporting</a></li>
        <li><a href="${DEMO_URL}llms.txt">Documentation index for agents</a></li>
      </ul>
    </main>`,
  };
}

export function transformDiscoveryHtml(html: string, isDemo: boolean): string {
  const { metadata, overview } = discoveryContent(isDemo);
  return html
    .replace(
      /<!-- fidusgate:metadata:start -->[\s\S]*?<!-- fidusgate:metadata:end -->/,
      () => metadata,
    )
    .replace('<!-- fidusgate:overview -->', () => overview);
}

export function discoveryPlugin(): Plugin {
  let isDemo = false;
  return {
    name: 'fidusgate-discovery',
    configResolved(config) {
      // Use Vite's resolved environment, exactly as the application entry point does.
      isDemo = config.env.VITE_FIDUSGATE_DEMO === 'true';
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return transformDiscoveryHtml(html, isDemo);
      },
    },
    generateBundle() {
      if (!isDemo) return;
      this.emitFile({
        type: 'asset',
        fileName: 'llms.txt',
        source: readFileSync(fileURLToPath(new URL('../../../llms.txt', import.meta.url)), 'utf8'),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'social-preview.png',
        source: readFileSync(
          fileURLToPath(new URL('../../../docs/assets/fg1048-case.png', import.meta.url)),
        ),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${DEMO_URL}</loc></url></urlset>\n`,
      });
      // A project-site /FidusGate/robots.txt cannot control the origin's crawlers.
      // Deliberately omit it; the page-level robots metadata applies to this page.
    },
  };
}
