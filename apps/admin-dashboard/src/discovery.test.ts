import { describe, expect, it } from 'vitest';
import { DEMO_URL, REPOSITORY_URL, transformDiscoveryHtml } from '../build/discovery';

import template from '../index.html?raw';

function documentFor(isDemo: boolean): Document {
  return new DOMParser().parseFromString(transformDiscoveryHtml(template, isDemo), 'text/html');
}

describe('mode-specific discovery HTML', () => {
  it('gives the public demo a single canonical, descriptive metadata, and source-linked structured data', () => {
    const document = documentFor(true);
    expect(document.title).toContain('demo');
    expect(document.querySelectorAll('title')).toHaveLength(1);
    expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toContain(
      'synthetic data',
    );
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(DEMO_URL);
    expect(document.querySelectorAll('meta[name="robots"]')).toHaveLength(1);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'index, follow',
    );
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(
      `${DEMO_URL}social-preview.png`,
    );
    const data = JSON.parse(
      document.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}',
    );
    expect(data.url).toBe(DEMO_URL);
    expect(data.about.codeRepository).toBe(REPOSITORY_URL);
    expect(data.about.license).toBe('https://www.apache.org/licenses/LICENSE-2.0');
  });

  it('offers honest text and navigable links before JavaScript runs', () => {
    const document = documentFor(true);
    const root = document.getElementById('root');
    expect(root?.querySelector('h1')?.textContent).toContain('Can the customer fix ship today');
    expect(root?.textContent).toContain(
      'choose between existing logs, a standard export and a signed-receipt pilot',
    );
    expect(root?.textContent).toContain(
      'does not connect an agent, evaluate Cedar, or execute tools',
    );
    expect(root?.textContent).toContain('does not establish issuer trust or prove execution');
    expect(root?.querySelector(`a[href="${REPOSITORY_URL}"]`)).not.toBeNull();
    expect(root?.querySelector(`a[href="${DEMO_URL}llms.txt"]`)).not.toBeNull();
  });

  it('does not advertise or index a gateway-connected console as the public demo', () => {
    const document = documentFor(false);
    expect(document.title).toContain('Gateway-connected');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow',
    );
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.querySelector('meta[property^="og:"]')).toBeNull();
    expect(document.querySelector('meta[name^="twitter:"]')).toBeNull();
    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
    expect(document.getElementById('root')?.textContent).toContain('configured gateway');
    expect(document.documentElement.outerHTML).not.toContain(DEMO_URL);
  });
});
