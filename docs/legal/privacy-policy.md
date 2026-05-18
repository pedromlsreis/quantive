# Privacy Policy

_Last updated: May 18, 2026_

## 1. Introduction

Quantive ("we", "our", "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our web application at usequantive.app, and sets out the rights you have under the EU General Data Protection Regulation (DSGVO).

## 2. Controller

The controller responsible for processing your personal data under Art. 4(7) DSGVO is:

Pedro Miguel Lima de Sousa Reis  
Lützowstraße 31, 40476 Düsseldorf, Germany  
<legal@usequantive.app>

We do not have a Data Protection Officer (DPO). As a solo controller below the headcount threshold of § 38 BDSG, none is required.

## 3. Information We Collect

**Account Information.** When you create an account, we collect your email address. Your password is processed by Supabase Auth (our auth provider), which stores only a salted hash — never the plaintext password.

**Portfolio Data.** Any portfolio data you enter or import is end-to-end encrypted in your browser before it reaches our servers (see §5 and the [Security & Encryption](https://usequantive.app/security) page). We see ciphertext only and cannot decrypt it. We do not share, sell, or analyse your financial data.

**Feedback.** If you submit feedback through the in-app feedback button, we store the message text, the type you selected (e.g. bug, idea), and your account ID so we can follow up. Feedback is not encrypted at rest. Do not include sensitive financial details in feedback messages.

**Usage Data.** Only if you grant analytics consent (see §9): anonymous product analytics (page views, feature usage) and anonymous web-performance metrics (Largest Contentful Paint, Interaction to Next Paint, Cumulative Layout Shift) via PostHog. No personally identifiable information, financial figures, or account details are included in these events.

**Campaign attribution.** If you arrive at the site via a link we publish that includes `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, or `utm_content` query parameters, those values are stored in your browser's localStorage. They are attached to analytics events only if you have granted analytics consent. They are cleared when you sign out or withdraw consent.

**Server Logs.** Our hosting providers (Supabase, our edge function host) keep short-lived operational logs (IP address, request timestamps, error traces) for reliability and abuse prevention.

## 4. Purposes & Legal Basis

We process your personal data for the following purposes, on the following legal bases under Art. 6(1) DSGVO:

| Purpose | Data | Legal basis |
|---|---|---|
| Provide and maintain the service | Account email, portfolio ciphertext | Art. 6(1)(b) — performance of contract |
| Authenticate your identity and protect your account | Password hash, session data | Art. 6(1)(b) — performance of contract |
| Process subscription payments | Stripe customer/subscription identifiers, billing data held by Stripe | Art. 6(1)(b) — performance of contract; Art. 6(1)(c) — compliance with German tax law (§ 147 AO) for invoice records |
| Send transactional emails (password reset, account-deletion confirmation, billing receipts) | Email address | Art. 6(1)(b) — performance of contract |
| Respond to feedback you submit and improve the product | Feedback message text + account ID | Art. 6(1)(f) — our legitimate interest in improving the service |
| Anonymous product analytics | PostHog identifier (localStorage), event metadata | Art. 6(1)(a) — your explicit consent (see §9) |
| Operate and secure the platform (rate limiting, abuse detection, error tracking) | IP address, request timestamps, error traces | Art. 6(1)(f) — our legitimate interest in service availability and security |

## 5. Data Storage & Security

Your portfolio data is **end-to-end encrypted** in your browser before it reaches our servers. We see ciphertext only and cannot decrypt your data — even if we wanted to. Database access is additionally protected by Postgres row-level security. We do not connect to your bank accounts or any third-party financial institutions.

For details on the cryptographic primitives, threat model, and what we explicitly do _not_ protect against, see the Security & Encryption page at usequantive.app/security.

## 6. Recipients & Third-Party Services

We share personal data only with the processors strictly required to run the service. Data processing agreements (Auftragsverarbeitungsverträge) are in place with each.

- **Stripe (Stripe Payments Europe, Ltd., Ireland)** — payment processing. Stripe's privacy policy applies to payment data. Stripe processes a subset of data in the United States; transfers are protected under EU Standard Contractual Clauses and Stripe is certified under the EU-US Data Privacy Framework.
- **Supabase (Supabase Inc., United States; EU data residency)** — authentication, database, and edge functions. Your project data is hosted in the EU; SCCs apply to any incidental US processing.
- **PostHog (PostHog Inc., United States; EU Cloud)** — anonymous product analytics, loaded only with your consent. Events are stored on PostHog's EU-hosted infrastructure. SCCs apply to any incidental US processing. See the [PostHog privacy policy](https://posthog.com/privacy).
- **Email delivery provider** — used solely for transactional emails (password resets, billing receipts, account-deletion confirmation, feedback notifications).

We do not sell or share your data with advertisers, data brokers, or any other third party.

## 7. Data Retention

| Category | Retention period | What happens at end |
|---|---|---|
| Account email and authentication data | Until you delete your account | Deleted from our database and from Supabase Auth |
| Portfolio data (ciphertext) | Until you delete your account | Deleted from our database |
| In-app preferences (currency, number format, privacy mode) | Until you delete your account or clear local storage | Deleted |
| Feedback messages (database) | Retained for product improvement for as long as we find them useful. When you delete your account, the link between your user ID and any feedback you submitted is permanently removed (`ON DELETE SET NULL`); the remaining message text becomes anonymous and is no longer personal data under DSGVO. | Anonymised on account deletion |
| Feedback messages (support inbox copy) | Retained in our support inbox under normal email retention; pruned manually on a comparable cadence. The user-ID link is severed only in the database, not in any email copy that has already been delivered. | Pruned manually |
| Server logs (IP, request timestamps, error traces) | Approximately 14 days, set by our hosting provider | Rotated out by provider |
| Analytics events (PostHog) | Approximately 12 months, per our PostHog project configuration | Pruned by PostHog |
| Payment & invoice records held by Stripe | 10 years from the end of the fiscal year, per § 147 AO (German tax-law retention) | Deleted by Stripe after the statutory period |

You can request export or deletion of any of the above at any time (see §8). Where statutory retention applies (notably tax-law records at Stripe), data will continue to be held by the relevant processor for the statutory period even after you delete your account.

## 8. Your Rights

Under the DSGVO, you have the right to:

- **Access** your personal data (Art. 15)
- **Rectification** of inaccurate data (Art. 16)
- **Erasure** ("right to be forgotten") of your data (Art. 17)
- **Restriction** of processing (Art. 18)
- **Data portability** — receive your data in a structured, machine-readable format (Art. 20)
- **Object** to processing carried out on the basis of legitimate interest (Art. 21)
- **Withdraw consent** at any time, without affecting the lawfulness of processing carried out before withdrawal (Art. 7(3))
- **Lodge a complaint** with a supervisory authority (Art. 77). Our competent authority is the Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen (LDI NRW), Kavalleriestraße 2–4, 40213 Düsseldorf, <https://www.ldi.nrw.de>

To exercise any of these rights, email <legal@usequantive.app>. We respond within 1 business day and resolve substantive requests within the 30-day statutory window (Art. 12(3)).

## 9. Cookies & local storage

We use **essential** cookies and localStorage entries only for authentication, session management, and remembering your in-app preferences (display currency, number format, privacy mode). We do not use advertising cookies, third-party tracking cookies, or cross-site tracking of any kind.

**Anonymous analytics (opt-in).** PostHog (see §6) is loaded _only_ if you explicitly grant consent via the banner shown on your first visit. If you decline — or simply dismiss the banner without choosing — PostHog is never loaded and no analytics identifier is written to your browser. If you grant consent, PostHog stores an anonymous identifier in **localStorage** (not in a cookie) so events from the same browser can be grouped without us knowing who you are.

You can change your choice at any time from Settings → Preferences → Anonymous analytics. Withdrawing consent immediately stops further capture, resets the PostHog identifier, and clears it from localStorage on your next page interaction. Campaign-attribution labels (see §3) are stored in localStorage under the same lifecycle as your consent.

## 10. Automated decision-making

We do not carry out automated decision-making within the meaning of Art. 22 DSGVO. Quantive's forecast and allocation views are informational projections derived from data you yourself enter; they do not produce decisions with legal or similarly significant effect on you.

## 11. Is providing your data required?

- **Account email** — required to use the service. Without it, we cannot authenticate you or send you transactional emails.
- **Portfolio data** — voluntary. The demo at usequantive.app/demo works without any data entry. You can use Quantive purely with sample data.
- **Feedback** — voluntary. You decide whether and when to submit it.
- **Analytics consent** — voluntary. The service works identically whether you grant or withhold it.

Where data is required, withholding it prevents account creation or use of the service. Where data is voluntary, withholding it has no consequence for your access.

## 12. Changes to This Policy

We may update this policy from time to time. We will notify you of significant changes via email or an in-app notification.

## 13. Contact

For questions about this Privacy Policy, or to exercise your rights under §8, contact us at <legal@usequantive.app>.
