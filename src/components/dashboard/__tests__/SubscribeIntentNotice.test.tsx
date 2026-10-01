import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const openAuth = vi.fn();

vi.mock('@/contexts/AuthModalContext', () => ({
  useAuthModal: () => ({ openAuth, closeAuth: vi.fn(), isOpen: false }),
  useAuthModalActions: () => ({ openAuth, closeAuth: vi.fn() }),
  useAuthModalState: () => ({ isOpen: false }),
}));

vi.mock('@/lib/analytics', () => ({
  analytics: {
    landingCtaClicked: vi.fn(),
  },
}));

import { SubscribeIntentNotice } from '../SubscribeIntentNotice';
import { analytics } from '@/lib/analytics';
import type { CheckoutChoice } from '@/lib/billing/checkoutIntent';

const PRO_YEARLY: CheckoutChoice = { plan: 'pro', interval: 'yearly' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SubscribeIntentNotice — copy and pricing', () => {
  it('renders the yearly plan price in the body copy', () => {
    render(<SubscribeIntentNotice plan={PRO_YEARLY} onCancel={vi.fn()} />);
    expect(screen.getByText(/€90 a year/)).toBeInTheDocument();
  });

  it('renders the monthly plan price in the body copy', () => {
    render(<SubscribeIntentNotice plan={{ plan: 'pro', interval: 'monthly' }} onCancel={vi.fn()} />);
    expect(screen.getByText(/€9 a month/)).toBeInTheDocument();
  });

  it('renders the section heading explaining the pending state', () => {
    render(<SubscribeIntentNotice plan={PRO_YEARLY} onCancel={vi.fn()} />);
    expect(screen.getByText(/sign up to subscribe to pro/i)).toBeInTheDocument();
  });

  it('names Family and its price for a Family intent', () => {
    render(<SubscribeIntentNotice plan={{ plan: 'family', interval: 'monthly' }} onCancel={vi.fn()} />);
    expect(screen.getByText(/sign up to subscribe to family/i)).toBeInTheDocument();
    expect(screen.getByText(/checkout opens for Family at €14 a month/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /sign up to continue/i }));
    expect(analytics.landingCtaClicked).toHaveBeenCalledWith({ cta: 'family_signup', location: 'pricing_card' });
  });
});

describe('SubscribeIntentNotice — accessibility', () => {
  it('exposes a labelled region for screen readers', () => {
    render(<SubscribeIntentNotice plan={PRO_YEARLY} onCancel={vi.fn()} />);
    expect(screen.getByRole('region', { name: /pro subscription pending/i })).toBeInTheDocument();
  });

  it('labels the dismiss icon button so it is announced', () => {
    render(<SubscribeIntentNotice plan={PRO_YEARLY} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /cancel pro subscription setup/i })).toBeInTheDocument();
  });
});

describe('SubscribeIntentNotice — primary action', () => {
  it('opens the AuthModal in signup mode when the primary button is clicked', () => {
    render(<SubscribeIntentNotice plan={PRO_YEARLY} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /sign up to continue/i }));
    expect(openAuth).toHaveBeenCalledTimes(1);
    expect(openAuth).toHaveBeenCalledWith('signup');
  });

  it('fires the pro_signup analytics event from the pricing_card location', () => {
    render(<SubscribeIntentNotice plan={PRO_YEARLY} onCancel={vi.fn()} />);
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
    render(<SubscribeIntentNotice plan={PRO_YEARLY} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel pro subscription setup/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not open the AuthModal when cancelling', () => {
    render(<SubscribeIntentNotice plan={PRO_YEARLY} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel pro subscription setup/i }));
    expect(openAuth).not.toHaveBeenCalled();
  });
});
