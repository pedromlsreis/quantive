import { Link } from 'react-router-dom';
import { StickyNav } from '@/components/landing/StickyNav';
import { Footer } from '@/components/Footer';

export default function TermsOfService() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <StickyNav />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-20">
        <h1 className="mb-2 text-3xl font-bold text-foreground">Terms of Service</h1>
        <p className="mb-10 text-sm text-muted-foreground">Last updated: May 6, 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground [&_h2]:text-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_strong]:text-foreground">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By creating an account or using Quantive ("the Service"), you agree to
            be bound by these Terms of Service. If you do not agree, please do not use the Service.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            Quantive is a personal finance dashboard that allows you to upload,
            visualise, and track your portfolio data over time. The Service is provided
            "as is" and is intended for personal, informational use only.
          </p>

          <h2>3. User Accounts</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>You must provide a valid email address to create an account.</li>
            <li>You are responsible for maintaining the security of your account credentials.</li>
            <li>You must not share your account with others or create multiple accounts.</li>
          </ul>

          <h2>4. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Use the Service for any unlawful purpose</li>
            <li>Attempt to gain unauthorised access to other users' data</li>
            <li>Upload malicious files or attempt to exploit the Service</li>
            <li>Reverse-engineer, scrape, or redistribute the Service</li>
          </ul>

          <h2>5. Subscriptions & Payments</h2>
          <p>
            The Service offers a free tier and a paid Pro tier. Pro subscriptions are
            billed monthly or annually via Stripe. You can cancel at any time; access
            continues until the end of your billing period.
          </p>
          <p>
            We reserve the right to change pricing with 30 days' notice. Refunds are
            handled on a case-by-case basis.
          </p>

          <h2>6. Data Ownership</h2>
          <p>
            You retain full ownership of your portfolio data. We do not claim any rights
            over your uploaded content. You can export or delete your data at any time.
          </p>

          <h2>7. Disclaimer</h2>
          <p>
            The Service is not financial advice. We do not provide investment recommendations.
            You are solely responsible for your financial decisions. The Service is provided
            without warranties of any kind, express or implied.
          </p>

          <h2>8. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Quantive and its creators shall
            not be liable for any indirect, incidental, or consequential damages arising from
            your use of the Service.
          </p>

          <h2>9. Termination</h2>
          <p>
            We may suspend or terminate your account if you violate these terms. You may
            delete your account at any time. Upon termination, your data will be permanently removed.
          </p>

          <h2>10. Changes to These Terms</h2>
          <p>
            We may update these terms from time to time. Continued use of the Service after
            changes constitutes acceptance. We will notify you of material changes via email.
          </p>

          <h2>11. Governing Law</h2>
          <p>
            These terms are governed by the laws of the European Union and applicable
            local legislation.
          </p>

          <h2>12. Contact</h2>
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
