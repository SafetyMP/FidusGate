import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

export const DEMO_URL = 'https://safetymp.github.io/FidusGate/';
export const REPOSITORY_URL = 'https://github.com/SafetyMP/FidusGate';
const description =
  'Reconcile a disputed MCP tool call, check Ed25519 receipts, and assemble an evidence handoff in a browser-only demo with synthetic data.';

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
    name: 'FidusGate — MCP decisions and signed receipts demo',
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
    metadata: `<title>FidusGate — MCP decisions and signed receipts demo</title>
    <meta name="description" content="${description}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${DEMO_URL}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="FidusGate" />
    <meta property="og:title" content="FidusGate — Understand the decision. Verify the receipt." />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${DEMO_URL}" />
    <meta property="og:image" content="${DEMO_URL}social-preview.png" />
    <meta property="og:image:width" content="1280" />
    <meta property="og:image:height" content="640" />
    <meta property="og:image:alt" content="FidusGate: MCP tool-call decisions and signed receipts. Interactive reference demo." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="FidusGate — MCP decisions and signed receipts" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${DEMO_URL}social-preview.png" />
    <meta name="twitter:image:alt" content="FidusGate: MCP tool-call decisions and signed receipts. Interactive reference demo." />
    <script type="application/ld+json">${JSON.stringify(structuredData)}</script>`,
    overview: `<main>
      <h1>FidusGate: understand MCP decisions and verify signed receipts</h1>
      <p>FidusGate is an open-source reference Model Context Protocol (MCP) gateway with Cedar authorization, Ed25519-signed receipts, and a receipt-first console.</p>
      <h2>Explore the interactive demo</h2>
      <p>Compare the ticket attachment with the gateway archive, verify both receipts, and assemble the evidence handoff for FG-1048. The investigation desk requires JavaScript.</p>
      <p>This browser-only demo uses synthetic records and a public demo key. It does not connect an agent, evaluate Cedar, or execute tools. Receipt input stays in your browser. A valid signature does not establish issuer trust or prove execution. FidusGate is not a production-hardened security product.</p>
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
          fileURLToPath(new URL('../../../docs/assets/social-preview.png', import.meta.url)),
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
