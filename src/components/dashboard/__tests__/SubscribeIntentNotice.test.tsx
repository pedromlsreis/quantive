import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const openAuth = vi.fn();

vi.mock('@/contexts/AuthModalContext', () => ({
  useAuthModal: () => ({ openAuth, closeAuth: vi.fn(), isOpen: false }),
}));

vi.mock('@/lib/analytics', () => ({
  analytics: {
    landingCtaClicked: vi.fn(),
  },
}));

import { SubscribeIntentNotice } from '../SubscribeIntentNotice';
import { analytics } from '@/lib/analytics';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SubscribeIntentNotice — copy and pricing', () => {
  it('renders the yearly plan price in the body copy', () => {
    render(<SubscribeIntentNotice plan="yearly" onCancel={vi.fn()} />);
    expect(screen.getByText(/€90\/year/)).toBeInTheDocument();
  });

  it('renders the monthly plan price in the body copy', () => {
    render(<SubscribeIntentNotice plan="monthly" onCancel={vi.fn()} />);
    expect(screen.getByText(/€9\/month/)).toBeInTheDocument();
  });

  it('renders the section heading explaining the pending state', () => {
    render(<SubscribeIntentNotice plan="yearly" onCancel={vi.fn()} />);
    expect(screen.getByText(/continue your pro subscription/i)).toBeInTheDocument();
  });
});

describe('SubscribeIntentNotice — accessibility', () => {
  it('exposes a labelled region for screen readers', () => {
    render(<SubscribeIntentNotice plan="yearly" onCancel={vi.fn()} />);
    expect(screen.getByRole('region', { name: /pro subscription pending/i })).toBeInTheDocument();
  });

  it('labels the dismiss icon button so it is announced', () => {
    render(<SubscribeIntentNotice plan="yearly" onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /cancel pro subscription setup/i })).toBeInTheDocument();
  });
});

describe('SubscribeIntentNotice — primary action', () => {
  it('opens the AuthModal in signup mode when the primary button is clicked', () => {
    render(<SubscribeIntentNotice plan="yearly" onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /sign up to continue/i }));
    expect(openAuth).toHaveBeenCalledTimes(1);
    expect(openAuth).toHaveBeenCalledWith('signup');
  });

  it('fires the pro_signup analytics event from the pricing_card location', () => {
    render(<SubscribeIntentNotice plan="yearly" onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /sign up to continue/i }));
    expect(analytics.landingCtaClicked).toHaveBeenCalledWith({
      cta: 'pro_signup',
      location: 'pricing_card',
    });
  });
});

describe('SubscribeIntentNotice — cancel action', () => {
  it('invokes onCancel when the dismiss button is clicked', () => {
    const onCancel = vi.fn();
    render(<SubscribeIntentNotice plan="yearly" onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel pro subscription setup/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not open the AuthModal when cancelling', () => {
    render(<SubscribeIntentNotice plan="yearly" onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel pro subscription setup/i }));
    expect(openAuth).not.toHaveBeenCalled();
  });
});
