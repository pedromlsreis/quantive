import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock all context-dependent and heavy modules
vi.mock('@/contexts/PortfolioContext', () => ({
  usePortfolio: vi.fn(),
}));

vi.mock('@/components/dashboard/AuthButton', () => ({
  AuthButton: () => <button>Sign in</button>,
}));

vi.mock('@/components/dashboard/WelcomeModal', () => ({
  WelcomeModal: () => null,
}));

vi.mock('@/components/dashboard/AddMeasurementModal', () => ({
  AddMeasurementModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="add-modal">Modal</div> : null,
}));

// Framer Motion: render all motion.* as plain HTML elements in tests
vi.mock('framer-motion', async () => {
  const React = await import('react');
  const tags = ['div', 'button', 'h1', 'p', 'span', 'section', 'main', 'nav', 'header', 'article'];
  const motion = Object.fromEntries(
    tags.map(tag => [
      tag,
      React.forwardRef(({ children, ...props }: Record<string, unknown>, ref: unknown) =>
        React.createElement(tag as string, { ...props, ref }, children)
      ),
    ])
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    useAnimation: () => ({ start: vi.fn(), stop: vi.fn() }),
    useInView: () => false,
  };
});

import { usePortfolio } from '@/contexts/PortfolioContext';
import { FileUpload } from '../FileUpload';

const mockUsePortfolio = vi.mocked(usePortfolio);

describe('FileUpload', () => {
  beforeEach(() => {
    mockUsePortfolio.mockReturnValue({
      loadFile: vi.fn(),
      loadMockData: vi.fn(),
      isLoading: false,
    } as unknown as ReturnType<typeof usePortfolio>);
  });

  it('renders the hero heading', () => {
    render(<FileUpload />);
    expect(screen.getByRole('heading', { name: /quantive/i })).toBeInTheDocument();
  });

  it('renders the primary CTA button', () => {
    render(<FileUpload />);
    expect(screen.getByRole('button', { name: /add your first measurement/i })).toBeInTheDocument();
  });

  it('renders the Try Demo button', () => {
    render(<FileUpload />);
    expect(screen.getByRole('button', { name: /try demo/i })).toBeInTheDocument();
  });

  it('renders the Download Template button', () => {
    render(<FileUpload />);
    expect(screen.getByRole('button', { name: /download template/i })).toBeInTheDocument();
  });

  it('renders the Browse Files label', () => {
    render(<FileUpload />);
    expect(screen.getByText(/browse files/i)).toBeInTheDocument();
  });

  it('opens add modal when CTA is clicked', () => {
    render(<FileUpload />);
    const cta = screen.getByRole('button', { name: /add your first measurement/i });
    fireEvent.click(cta);
    expect(screen.getByTestId('add-modal')).toBeInTheDocument();
  });

  it('calls loadMockData when Try Demo is clicked', () => {
    const loadMockData = vi.fn();
    mockUsePortfolio.mockReturnValue({
      loadFile: vi.fn(),
      loadMockData,
      isLoading: false,
    } as unknown as ReturnType<typeof usePortfolio>);
    render(<FileUpload />);
    fireEvent.click(screen.getByRole('button', { name: /try demo/i }));
    expect(loadMockData).toHaveBeenCalledOnce();
  });

  it('shows loading state when isLoading is true', () => {
    mockUsePortfolio.mockReturnValue({
      loadFile: vi.fn(),
      loadMockData: vi.fn(),
      isLoading: true,
    } as unknown as ReturnType<typeof usePortfolio>);
    render(<FileUpload />);
    expect(screen.getByText(/processing file/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /quantive/i })).not.toBeInTheDocument();
  });

  it('file input accepts xlsx and xls', () => {
    render(<FileUpload />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input?.accept).toContain('.xlsx');
    expect(input?.accept).toContain('.xls');
  });

  it('file input has sr-only class (visually hidden)', () => {
    render(<FileUpload />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input?.className).toContain('sr-only');
  });
});
