import { Link } from 'react-router-dom';
import { StickyNav } from '@/components/landing/StickyNav';
import { Footer } from '@/components/Footer';

export default function PrivacyPolicy() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <StickyNav />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-20">
        <h1 className="mb-2 text-3xl font-bold text-foreground">Privacy Policy</h1>
        <p className="mb-10 text-sm text-muted-foreground">Last updated: May 6, 2026</p>

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
          <p><strong>Usage Data:</strong> We may collect anonymous usage analytics (page views, feature usage) to improve the product. No personally identifiable information is included.</p>

          <h2>3. How We Use Your Information</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>To provide and maintain the service</li>
            <li>To authenticate your identity and protect your account</li>
            <li>To process subscription payments (via Stripe)</li>
            <li>To send transactional emails (e.g. password resets)</li>
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

          <h2>8. Cookies</h2>
          <p>
            We use essential cookies only for authentication and session management.
            We do not use advertising or tracking cookies.
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
