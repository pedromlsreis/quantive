import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';

// jsdom + the framer-motion mock don't carry `dataTransfer` through
// fireEvent.drop's init, so attach it explicitly on the event.
function dropFile(el: Element, file: File) {
  const ev = createEvent.drop(el);
  Object.defineProperty(ev, 'dataTransfer', { value: { files: [file] } });
  fireEvent(el, ev);
}

// Mock all context-dependent and heavy modules
vi.mock('@/contexts/PortfolioContext', () => ({
  usePortfolio: vi.fn(),
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
  const MOTION_PROPS = new Set([
    'initial', 'animate', 'exit', 'transition', 'variants', 'custom',
    'whileHover', 'whileTap', 'whileFocus', 'whileDrag', 'whileInView',
    'layout', 'layoutId', 'layoutDependency', 'layoutScroll', 'layoutRoot',
    'viewport', 'inherit', 'transformTemplate', 'transformValues',
    'onAnimationStart', 'onAnimationComplete', 'onUpdate',
    'onHoverStart', 'onHoverEnd', 'onTapStart', 'onTap', 'onTapCancel',
    'onViewportEnter', 'onViewportLeave',
    'onLayoutAnimationStart', 'onLayoutAnimationComplete',
  ]);
  const stripMotionProps = (props: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const k in props) if (!MOTION_PROPS.has(k)) out[k] = props[k];
    return out;
  };
  const tags = ['div', 'button', 'h1', 'p', 'span', 'section', 'main', 'nav', 'header', 'article'];
  const motion = Object.fromEntries(
    tags.map(tag => [
      tag,
      React.forwardRef(({ children, ...props }: Record<string, unknown>, ref: unknown) =>
        React.createElement(tag as string, { ...stripMotionProps(props), ref }, children as React.ReactNode)
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

vi.mock('@/lib/analytics', () => ({
  analytics: {
    onboardingEmptyStateViewed: vi.fn(),
    demoLoaded: vi.fn(),
    fileUploadFailed: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { usePortfolio } from '@/contexts/PortfolioContext';
import { analytics } from '@/lib/analytics';
import { toast } from 'sonner';
import { FileUpload } from '../FileUpload';

const mockUsePortfolio = vi.mocked(usePortfolio);

describe('FileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('fires onboardingEmptyStateViewed once on mount', () => {
    render(<FileUpload />);
    expect(analytics.onboardingEmptyStateViewed).toHaveBeenCalledOnce();
  });

  it('loads a dropped .xlsx file', () => {
    const loadFile = vi.fn();
    mockUsePortfolio.mockReturnValue({
      loadFile,
      loadMockData: vi.fn(),
      isLoading: false,
    } as unknown as ReturnType<typeof usePortfolio>);
    render(<FileUpload />);
    const dropzone = screen.getByText(/browse files/i).closest('div')!;
    const file = new File(['x'], 'portfolio.xlsx');
    dropFile(dropzone, file);
    expect(loadFile).toHaveBeenCalledWith(file);
    expect(toast.error).not.toHaveBeenCalled();
    expect(analytics.fileUploadFailed).not.toHaveBeenCalled();
  });

  it('rejects a dropped non-xlsx file with a toast and a wrong_type event', () => {
    const loadFile = vi.fn();
    mockUsePortfolio.mockReturnValue({
      loadFile,
      loadMockData: vi.fn(),
      isLoading: false,
    } as unknown as ReturnType<typeof usePortfolio>);
    render(<FileUpload />);
    const dropzone = screen.getByText(/browse files/i).closest('div')!;
    const file = new File(['x'], 'portfolio.csv', { type: 'text/csv' });
    dropFile(dropzone, file);
    expect(loadFile).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledOnce();
    expect(analytics.fileUploadFailed).toHaveBeenCalledWith({ reason: 'wrong_type' });
  });
});
