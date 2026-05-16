import { Link } from 'react-router-dom';
import { StickyNav } from '@/components/landing/StickyNav';
import { Footer } from '@/components/Footer';
import { usePageMeta } from '@/hooks/usePageMeta';

export default function TermsOfService() {
  usePageMeta({
    title: 'Terms of Service – Quantive',
    description: 'Terms of Service for Quantive. Review our usage policies, acceptable use guidelines, and your rights as a user.',
    path: '/terms',
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <StickyNav />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-20">
        <h1 className="mb-2 text-3xl font-bold text-foreground">Terms of Service</h1>
        <p className="mb-10 text-sm text-muted-foreground">Last updated: May 17, 2026</p>

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

          <h2>6. Right of Withdrawal (Widerrufsrecht)</h2>
          <p>
            If you are a consumer within the European Union, you have the right to withdraw
            from this contract within <strong>14 days</strong> without giving any reason.
            The withdrawal period begins on the date your subscription is confirmed.
          </p>
          <p>
            <strong>Waiver of the right of withdrawal for digital services:</strong> By
            completing your subscription purchase, you expressly request that we begin
            providing the Service immediately. You acknowledge that you thereby lose your
            right of withdrawal once performance of the Service has begun.
          </p>
          <p>
            If you wish to exercise your right of withdrawal before the Service has started,
            notify us in writing at{' '}
            <a href="mailto:legal@usequantive.app" className="text-primary hover:underline">
              legal@usequantive.app
            </a>{' '}
            within the 14-day period. Upon a valid withdrawal, we will refund all payments
            received from you without undue delay.
          </p>

          <h3 className="mt-6 text-base font-semibold text-foreground">
            Widerrufsbelehrung (statutory model — German, legally binding)
          </h3>
          <p lang="de">
            <strong>Widerrufsrecht.</strong> Sie haben das Recht, binnen vierzehn Tagen ohne
            Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt
            vierzehn Tage ab dem Tag des Vertragsabschlusses.
          </p>
          <p lang="de">
            Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (Pedro Miguel Lima de Sousa Reis,
            Lützowstraße 31, 40476 Düsseldorf, Deutschland,{' '}
            <a href="mailto:legal@usequantive.app" className="text-primary hover:underline">
              legal@usequantive.app
            </a>
            ) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief
            oder eine E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen,
            informieren. Sie können dafür das nachstehende Muster-Widerrufsformular
            verwenden, das jedoch nicht vorgeschrieben ist.
          </p>
          <p lang="de">
            Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die
            Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.
          </p>
          <p lang="de">
            <strong>Folgen des Widerrufs.</strong> Wenn Sie diesen Vertrag widerrufen, haben
            wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich und
            spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die
            Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für
            diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der
            ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde
            ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser
            Rückzahlung Entgelte berechnet.
          </p>

          <h3 className="mt-6 text-base font-semibold text-foreground">
            Withdrawal instructions (non-binding English translation)
          </h3>
          <p>
            You have the right to withdraw from this contract within 14 days without giving
            any reason. The withdrawal period is 14 days from the day on which the contract
            is concluded.
          </p>
          <p>
            To exercise your right of withdrawal, you must inform us (Pedro Miguel Lima de
            Sousa Reis, Lützowstraße 31, 40476 Düsseldorf, Germany,{' '}
            <a href="mailto:legal@usequantive.app" className="text-primary hover:underline">
              legal@usequantive.app
            </a>
            ) by a clear statement (for example, a letter sent by post or an email) of your
            decision to withdraw from this contract. You may use the model withdrawal form
            below, but it is not mandatory.
          </p>
          <p>
            To meet the withdrawal deadline, it is sufficient that you send your
            communication concerning the exercise of the right of withdrawal before the
            withdrawal period has expired.
          </p>
          <p>
            <strong>Consequences of withdrawal.</strong> If you withdraw from this contract,
            we will reimburse all payments received from you without undue delay and no later
            than 14 days from the day on which we are informed of your decision. We will use
            the same means of payment that you used for the original transaction, unless
            expressly agreed otherwise; in no case will you be charged any fees for this
            reimbursement.
          </p>

          <h3 className="mt-6 text-base font-semibold text-foreground">
            Muster-Widerrufsformular (German, legally binding)
          </h3>
          <p lang="de" className="italic">
            (Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular
            aus und senden Sie es zurück.)
          </p>
          <ul lang="de" className="list-none space-y-1 pl-0">
            <li>
              — An Pedro Miguel Lima de Sousa Reis, Lützowstraße 31, 40476 Düsseldorf,
              Deutschland,{' '}
              <a href="mailto:legal@usequantive.app" className="text-primary hover:underline">
                legal@usequantive.app
              </a>
              :
            </li>
            <li>
              — Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag
              über die Erbringung der folgenden Dienstleistung (*):
            </li>
            <li>— Bestellt am (*) / erhalten am (*):</li>
            <li>— Name des/der Verbraucher(s):</li>
            <li>— Anschrift des/der Verbraucher(s):</li>
            <li>
              — Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier):
            </li>
            <li>— Datum:</li>
          </ul>
          <p lang="de" className="italic text-xs">
            (*) Unzutreffendes streichen.
          </p>

          <h3 className="mt-6 text-base font-semibold text-foreground">
            Model withdrawal form (non-binding English translation)
          </h3>
          <p className="italic">
            (Complete and return this form only if you wish to withdraw from the contract.)
          </p>
          <ul className="list-none space-y-1 pl-0">
            <li>
              — To Pedro Miguel Lima de Sousa Reis, Lützowstraße 31, 40476 Düsseldorf,
              Germany,{' '}
              <a href="mailto:legal@usequantive.app" className="text-primary hover:underline">
                legal@usequantive.app
              </a>
              :
            </li>
            <li>
              — I/We (*) hereby give notice that I/we (*) withdraw from my/our (*) contract
              for the provision of the following service (*):
            </li>
            <li>— Ordered on (*) / received on (*):</li>
            <li>— Name of consumer(s):</li>
            <li>— Address of consumer(s):</li>
            <li>
              — Signature of consumer(s) (only if this form is notified on paper):
            </li>
            <li>— Date:</li>
          </ul>
          <p className="italic text-xs">(*) Delete as appropriate.</p>

          <h2>7. Data Ownership</h2>
          <p>
            You retain full ownership of your portfolio data. We do not claim any rights
            over your uploaded content. You can export or delete your data at any time.
          </p>

          <h2>8. Disclaimer</h2>
          <p>
            The Service is not financial advice. We do not provide investment recommendations.
            You are solely responsible for your financial decisions. The Service is provided
            without warranties of any kind, express or implied.
          </p>

          <h2>9. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Quantive and its creators shall
            not be liable for any indirect, incidental, or consequential damages arising from
            your use of the Service.
          </p>

          <h2>10. Termination</h2>
          <p>
            We may suspend or terminate your account if you violate these terms. You may
            delete your account at any time. Upon termination, your data will be permanently removed.
          </p>

          <h2>11. Changes to These Terms</h2>
          <p>
            We may update these terms from time to time. Continued use of the Service after
            changes constitutes acceptance. We will notify you of material changes via email.
          </p>

          <h2>12. Governing Law</h2>
          <p>
            These terms are governed by the laws of the Federal Republic of Germany,
            excluding its conflict-of-law provisions. If you are a consumer in the EU,
            you also benefit from mandatory protections of your country of residence.
            The place of jurisdiction is Düsseldorf, Germany.
          </p>

          <h2>13. Consumer dispute resolution (§ 36 VSBG)</h2>
          <p>
            We are neither obliged nor willing to participate in alternative dispute
            resolution before a consumer arbitration board (Verbraucherschlichtungsstelle)
            under § 36 VSBG.
          </p>

          <h2>14. Contact</h2>
          <p>
            For questions about these Terms of Service, contact us at{' '}
            <a
              href="mailto:legal@usequantive.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              legal@usequantive.app
            </a>.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
