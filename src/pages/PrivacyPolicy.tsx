import { Link } from 'react-router-dom';
import { StickyNav } from '@/components/landing/StickyNav';
import { Footer } from '@/components/Footer';
import { usePageMeta } from '@/hooks/usePageMeta';

export default function PrivacyPolicy() {
  usePageMeta({
    title: 'Privacy Policy – Quantive',
    description: 'Read the Quantive privacy policy. We store only encrypted data, use no advertising trackers, and collect only what is necessary to run the service.',
    path: '/privacy',
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <StickyNav />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-20">
        <h1 className="mb-2 text-3xl font-bold text-foreground">Privacy Policy</h1>
        <p className="mb-10 text-sm text-muted-foreground">Last updated: May 16, 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground [&_h2]:text-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_strong]:text-foreground">
          <h2>1. Introduction</h2>
          <p>
            Quantive ("we", "our", "us") is committed to protecting your privacy.
            This Privacy Policy explains how we collect, use, and safeguard your information
            when you use our web application at{' '}
            <Link to="/" className="text-primary hover:underline">usequantive.app</Link>.
          </p>

          <h2>2. Information We Collect</h2>
          <p><strong>Account Information:</strong> When you create an account, we collect your email address and an encrypted password.</p>
          <p><strong>Portfolio Data:</strong> If you upload portfolio spreadsheets, the data is stored in your private account. We do not share, sell, or analyse your financial data for any purpose other than providing you with the service.</p>
          <p><strong>Feedback:</strong> If you submit feedback through the in-app feedback button, we store the message text, the type you selected (e.g. bug, idea), and your account ID so we can follow up. Feedback is not encrypted at rest. Do not include sensitive financial details in feedback messages.</p>
          <p><strong>Usage Data:</strong> We collect anonymous usage analytics (page views, feature usage) to improve the product via PostHog. No personally identifiable information, financial figures, or account details are included in these events.</p>
          <p><strong>Campaign attribution:</strong> If you arrive at the site via a link we publish that includes <code>utm_source</code>, <code>utm_medium</code>, <code>utm_campaign</code>, <code>utm_term</code>, or <code>utm_content</code> query parameters, those values are stored in your browser's localStorage and attached to subsequent analytics events so we can see which channels bring people to Quantive. These are labels we set in our own outbound links — they contain no information about you. They are cleared when you sign out.</p>
          <p><strong>Server Logs:</strong> Our hosting providers (Supabase, our edge function host) keep short-lived operational logs (IP address, request timestamps, error traces) for reliability and abuse prevention.</p>

          <h2>3. How We Use Your Information</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>To provide and maintain the service</li>
            <li>To authenticate your identity and protect your account</li>
            <li>To process subscription payments (via Stripe)</li>
            <li>To send transactional emails (e.g. password resets)</li>
            <li>To respond to feedback you submit</li>
            <li>To improve the product based on aggregated, anonymous usage patterns</li>
          </ul>

          <h2>4. Data Storage & Security</h2>
          <p>
            Your portfolio data is <strong>end-to-end encrypted</strong> in your
            browser before it reaches our servers. We see ciphertext only and
            cannot decrypt your data — even if we wanted to. Database access is
            additionally protected by Postgres row-level security. We do not
            connect to your bank accounts or any third-party financial
            institutions.
          </p>
          <p>
            For details on the cryptographic primitives, threat model, and what
            we explicitly do <em>not</em> protect against, see our{' '}
            <Link to="/security" className="text-primary hover:underline">
              Security & Encryption page
            </Link>
            .
          </p>

          <h2>5. Third-Party Services</h2>
          <p>We use the following third-party services:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Stripe</strong> — for payment processing. Stripe's privacy policy applies to payment data.</li>
            <li><strong>Supabase</strong> — for authentication and database services.</li>
            <li><strong>PostHog</strong> — for anonymous product analytics. We track only explicit user actions (page views, feature usage) and campaign-attribution labels (see §2). No personally identifiable information, financial data, or email addresses are ever sent to PostHog. Events are stored on PostHog's EU-hosted infrastructure. See the <a href="https://posthog.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">PostHog privacy policy</a>.</li>
          </ul>

          <h2>6. Data Retention</h2>
          <p>
            We retain your account and portfolio data for as long as your account is active.
            You can delete your data or export it at any time. If you delete your account,
            all associated data will be permanently removed.
          </p>

          <h2>7. Your Rights</h2>
          <p>You have the right to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Access your personal data</li>
            <li>Export your portfolio data</li>
            <li>Request deletion of your account and data</li>
            <li>Withdraw consent at any time</li>
          </ul>

          <h2>8. Cookies & local storage</h2>
          <p>
            We use essential cookies only for authentication and session management. We do not use advertising cookies, third-party tracking cookies, or cross-site tracking of any kind.
          </p>
          <p>
            PostHog (see §5) stores an anonymous identifier in your browser's <strong>localStorage</strong> — not in a cookie — so events from the same browser can be grouped without us knowing who you are. This identifier is cleared when you sign out and can be cleared at any time by clearing your browser's site data for usequantive.app.
          </p>

          <h2>9. Changes to This Policy</h2>
          <p>
            We may update this policy from time to time. We will notify you of significant
            changes via email or an in-app notification.
          </p>

          <h2>10. Contact</h2>
          <p>
            For questions about this Privacy Policy, contact us at{' '}
            <a
              href="mailto:hello@usequantive.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              hello@usequantive.app
            </a>.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
