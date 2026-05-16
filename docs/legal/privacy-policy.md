<!-- Keep in sync with the live page at src/pages/PrivacyPolicy.tsx. Any edit here needs a matching edit there (and vice versa). -->

# Privacy Policy

_Last updated: May 17, 2026_

## 1. Introduction

Quantive ("we", "our", "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our web application at usequantive.app.

## 2. Information We Collect

**Account Information:** When you create an account, we collect your email address. Your password is processed by Supabase Auth (our auth provider), which stores only a salted hash — never the plaintext password.

**Portfolio Data:** Any portfolio data you enter or import is end-to-end encrypted in your browser before it reaches our servers (see §4 and the [Security & Encryption](https://usequantive.app/security) page). We see ciphertext only and cannot decrypt it. We do not share, sell, or analyse your financial data.

**Feedback:** If you submit feedback through the in-app feedback button, we store the message text, the type you selected (e.g. bug, idea), and your account ID so we can follow up. Feedback is not encrypted at rest. Do not include sensitive financial details in feedback messages.

**Usage Data:** We collect anonymous usage analytics (page views, feature usage) to improve the product via PostHog. No personally identifiable information, financial figures, or account details are included in these events.

**Campaign attribution:** If you arrive at the site via a link we publish that includes `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, or `utm_content` query parameters, those values are stored in your browser's localStorage and attached to subsequent analytics events so we can see which channels bring people to Quantive. These are labels we set in our own outbound links — they contain no information about you. They are cleared when you sign out.

**Server Logs:** Our hosting providers (Supabase, our edge function host) keep short-lived operational logs (IP, request timestamps, error traces) for reliability and abuse prevention.

## 3. How We Use Your Information

- To provide and maintain the service
- To authenticate your identity and protect your account
- To process subscription payments (via Stripe), once paid plans are live
- To send transactional emails (e.g. password resets, account deletion confirmations)
- To respond to feedback you submit
- To improve the product based on aggregated, anonymous usage patterns

## 4. Data Storage & Security

Your portfolio data is **end-to-end encrypted** in your browser before it reaches our servers. We see ciphertext only and cannot decrypt your data — even if we wanted to. Database access is additionally protected by Postgres row-level security. We do not connect to your bank accounts or any third-party financial institutions.

For details on the cryptographic primitives, threat model, and what we explicitly do _not_ protect against, see the Security & Encryption page at usequantive.app/security.

## 5. Third-Party Services

We use the following third-party services:

- **Stripe** — for payment processing. Stripe's privacy policy applies to payment data.
- **Supabase** — for authentication and database services.
- **PostHog** — for anonymous product analytics. We track only explicit user actions (page views, feature usage) and campaign-attribution labels (see §2). No personally identifiable information, financial data, or email addresses are ever sent to PostHog. Events are stored on PostHog's EU-hosted infrastructure. See the [PostHog privacy policy](https://posthog.com/privacy).

## 6. Data Retention

We retain your account and portfolio data for as long as your account is active. You can delete your data or export it at any time. If you delete your account, all associated data will be permanently removed.

## 7. Your Rights

You have the right to:

- Access your personal data
- Export your portfolio data
- Request deletion of your account and data
- Withdraw consent at any time

## 8. Cookies & local storage

We use **essential** cookies and localStorage entries only for authentication, session management, and remembering your in-app preferences (display currency, number format, privacy mode). We do not use advertising cookies, third-party tracking cookies, or cross-site tracking of any kind.

**Anonymous analytics (opt-in).** PostHog (see §5) is loaded _only_ if you explicitly grant consent via the banner shown on your first visit. If you decline — or simply dismiss the banner without choosing — PostHog is never loaded and no analytics identifier is written to your browser. If you grant consent, PostHog stores an anonymous identifier in **localStorage** (not in a cookie) so events from the same browser can be grouped without us knowing who you are.

You can change your choice at any time from Settings → Preferences → Anonymous analytics. Withdrawing consent immediately stops further capture, resets the PostHog identifier, and clears it from localStorage on your next page interaction. Campaign-attribution labels (see §2) are stored in localStorage under the same lifecycle as your consent.

## 9. Changes to This Policy

We may update this policy from time to time. We will notify you of significant changes via email or an in-app notification.

## 10. Contact

For questions about this Privacy Policy, or to exercise your rights under §7, contact us at <legal@usequantive.app>.
