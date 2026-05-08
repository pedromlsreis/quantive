# Privacy Policy

_Last updated: May 8, 2026_

## 1. Introduction

Quantive ("we", "our", "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our web application at usequantive.app.

## 2. Information We Collect

**Account Information:** When you create an account, we collect your email address. Your password is processed by Supabase Auth (our auth provider), which stores only a salted hash — never the plaintext password.

**Portfolio Data:** Any portfolio data you enter or import is end-to-end encrypted in your browser before it reaches our servers (see §4 and the [Security & Encryption](https://usequantive.app/security) page). We see ciphertext only and cannot decrypt it. We do not share, sell, or analyse your financial data.

**Feedback:** If you submit feedback through the in-app feedback button, we store the message text, the type you selected (e.g. bug, idea), and your account ID so we can follow up. Feedback is not encrypted at rest. Do not include sensitive financial details in feedback messages.

**Server Logs:** Our hosting providers (Supabase, our edge function host) keep short-lived operational logs (IP, request timestamps, error traces) for reliability and abuse prevention. We do not run product analytics — no Google Analytics, Plausible, PostHog, or similar tools are loaded by the site today. If we add privacy-respecting analytics in the future, we will update this policy and announce the change before enabling it.

## 3. How We Use Your Information

- To provide and maintain the service
- To authenticate your identity and protect your account
- To process subscription payments (via Stripe), once paid plans are live
- To send transactional emails (e.g. password resets, account deletion confirmations)
- To respond to feedback you submit

## 4. Data Storage & Security

Your portfolio data is **end-to-end encrypted** in your browser before it reaches our servers. We see ciphertext only and cannot decrypt your data — even if we wanted to. Database access is additionally protected by Postgres row-level security. We do not connect to your bank accounts or any third-party financial institutions.

For details on the cryptographic primitives, threat model, and what we explicitly do _not_ protect against, see the Security & Encryption page at usequantive.app/security.

## 5. Third-Party Services

We use the following third-party services:

- **Stripe** — for payment processing. Stripe's privacy policy applies to payment data.
- **Supabase** — for authentication and database services.

## 6. Data Retention

We retain your account and portfolio data for as long as your account is active. You can delete your data or export it at any time. If you delete your account, all associated data will be permanently removed.

## 7. Your Rights

You have the right to:

- Access your personal data
- Export your portfolio data
- Request deletion of your account and data
- Withdraw consent at any time

## 8. Cookies

We use essential cookies only for authentication and session management. We do not use advertising or tracking cookies.

## 9. Changes to This Policy

We may update this policy from time to time. We will notify you of significant changes via email or an in-app notification.

## 10. Contact

For questions about this Privacy Policy, contact us at <hello@usequantive.app>.
