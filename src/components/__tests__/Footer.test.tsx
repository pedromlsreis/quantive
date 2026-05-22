import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Footer } from '../Footer';

describe('Footer', () => {
  it('renders the current-year copyright', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    const year = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(`© ${year} Quantive`))).toBeInTheDocument();
  });

  it.each<[string, string]>([
    ['Security',  '/security'],
    ['Privacy',   '/privacy'],
    ['Terms',     '/terms'],
    ['Impressum', '/impressum'],
  ])('exposes the %s link pointing to %s', (label, href) => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: new RegExp(`^${label}$`) });
    expect(link.getAttribute('href')).toBe(href);
  });

  it('uses the contentinfo landmark role', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
