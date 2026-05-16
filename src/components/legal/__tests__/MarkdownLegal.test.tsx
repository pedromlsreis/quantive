import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock the chrome — we are testing markdown rendering, not navigation.
// StickyNav reaches into AuthContext at module load, which is not the
// concern of this test file.
vi.mock('@/components/landing/StickyNav', () => ({
  StickyNav: () => null,
}));
vi.mock('@/components/Footer', () => ({
  Footer: () => null,
}));
vi.mock('@/hooks/usePageMeta', () => ({
  usePageMeta: () => undefined,
}));

import { MarkdownLegal } from '../MarkdownLegal';
import privacy from '../../../../docs/legal/privacy-policy.md?raw';
import terms from '../../../../docs/legal/terms-of-service.md?raw';
import impressum from '../../../../docs/legal/impressum.md?raw';

function renderLegal(source: string, title = 'Doc') {
  return render(
    <MemoryRouter>
      <MarkdownLegal source={source} pageTitle={title} pageDescription="" path="/x" />
    </MemoryRouter>,
  );
}

describe('MarkdownLegal', () => {
  it('renders the Privacy Policy with key Art. 13 sections and anchors', () => {
    const { container } = renderLegal(privacy, 'Privacy');
    expect(screen.getByRole('heading', { level: 1, name: /Privacy Policy/i })).toBeInTheDocument();
    // Section headings that must be present per the DSGVO audit.
    expect(screen.getByRole('heading', { name: /Controller/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Purposes & Legal Basis/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Data Retention/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Your Rights/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Automated decision-making/i })).toBeInTheDocument();
    // Concrete legal anchors that must survive any future edit. Read against the
    // composed document text so table-cell nesting and whitespace handling don't
    // make these brittle.
    const text = container.textContent ?? '';
    expect(text).toContain('LDI NRW');
    expect(text).toContain('§ 147 AO');
    expect(text).toMatch(/Art\.\s*6\(1\)\(b\)/);
  });

  it('renders the Terms with §13 VSBG notice and the Muster sections', () => {
    renderLegal(terms, 'Terms');
    expect(screen.getByRole('heading', { name: /Consumer dispute resolution/i })).toBeInTheDocument();
    expect(screen.getByText(/Verbraucherschlichtungsstelle/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Widerrufsbelehrung/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Muster-Widerrufsformular/i })).toBeInTheDocument();
  });

  it('preserves lang="de" on the German Muster blocks for screen readers', () => {
    const { container } = renderLegal(terms, 'Terms');
    const germanBlocks = container.querySelectorAll('[lang="de"]');
    // Two Muster blocks: the Widerrufsbelehrung and the Widerrufsformular.
    expect(germanBlocks.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the Impressum with Kleinunternehmer note and § 5 DDG citation', () => {
    renderLegal(impressum, 'Impressum');
    expect(screen.getByRole('heading', { level: 1, name: /Impressum/i })).toBeInTheDocument();
    expect(screen.getByText(/Kleinunternehmer/)).toBeInTheDocument();
    expect(screen.getByText(/§ 5 DDG/)).toBeInTheDocument();
  });

  it('opens external links in a new tab with rel="noopener noreferrer"', () => {
    const { container } = renderLegal(
      '# Doc\n\nSee the [PostHog policy](https://posthog.com/privacy) for details.',
    );
    const link = container.querySelector('a[href="https://posthog.com/privacy"]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
  });
});
