import { Link } from 'react-router-dom';
import { StickyNav } from '@/components/landing/StickyNav';
import { Footer } from '@/components/Footer';
import { usePageMeta } from '@/hooks/usePageMeta';
import {
  Lock,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  Key,
} from 'lucide-react';

const REPO_URL = 'https://github.com/pedromlsreis/quantive';
const DESIGN_DOC_URL = `${REPO_URL}/blob/main/docs/security/encryption.md`;
const CRYPTO_MODULE_URL = `${REPO_URL}/tree/main/src/lib/crypto`;

export default function SecurityPage() {
  usePageMeta({
    title: 'Security & Encryption – Quantive',
    description: 'Quantive encrypts your financial data on your device using XChaCha20-Poly1305 and Argon2id. The server only ever sees ciphertext. Learn how it works.',
    path: '/security',
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <StickyNav />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-20">
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Security & Encryption</h1>
        </div>
        <p className="mb-10 text-sm text-muted-foreground">
          What we do, what we don't do, and how to verify it yourself.
        </p>

        <div className="space-y-10 text-sm leading-relaxed text-muted-foreground">

          {/* The headline claim */}
          <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
            <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-foreground">
              <Lock className="h-4 w-4 text-primary" />
              Your data is encrypted on your device, before it reaches our servers.
            </h2>
            <p className="text-foreground/80">
              Your portfolio is encrypted in your browser using a key derived
              from your password. We only ever see ciphertext. A full database
              leak — by us, our hosting provider, or anyone else — would
              reveal nothing about your finances.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Cryptographic primitives: <strong className="text-foreground">XChaCha20-Poly1305</strong> for
              encryption, <strong className="text-foreground">Argon2id</strong> for password-based
              key derivation. Both via{' '}
              <a
                href="https://doc.libsodium.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                libsodium
              </a>
              .
            </p>
          </section>

          {/* Key hierarchy diagram */}
          <section>
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              How your key hierarchy works
            </h2>
            <div className="rounded-xl border border-border bg-card/50 p-5 font-mono text-xs leading-relaxed text-foreground/80 overflow-x-auto">
              <div className="flex flex-col items-center">
                {/* Row 1: inputs */}
                <div className="flex gap-8">
                  <div className="flex flex-col items-center gap-1">
                    <div className="rounded border border-primary/40 bg-primary/10 px-3 py-1.5 text-center text-primary font-semibold">
                      your password
                    </div>
                    <div className="text-muted-foreground text-[10px]">never sent to server</div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="rounded border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-center text-amber-500 font-semibold">
                      recovery code
                    </div>
                    <div className="text-muted-foreground text-[10px]">24-word BIP-39, opt-in</div>
                  </div>
                </div>

                {/* Arrows down to KDFs */}
                <div className="flex gap-8 mt-1">
                  <div className="flex flex-col items-center">
                    <div className="text-muted-foreground">↓ Argon2id</div>
                    <div className="rounded border border-border bg-muted/30 px-3 py-1.5 text-center">
                      KEK
                    </div>
                    <div className="text-muted-foreground text-[10px]">Key Encryption Key</div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="text-muted-foreground">↓ Argon2id</div>
                    <div className="rounded border border-border bg-muted/30 px-3 py-1.5 text-center">
                      Recovery KEK
                    </div>
                    <div className="text-muted-foreground text-[10px]">Key Encryption Key</div>
                  </div>
                </div>

                {/* Both KEKs unwrap the same DK */}
                <div className="mt-2 text-muted-foreground text-center">
                  ↓ both unwrap (XSalsa20) ↓
                </div>
                <div className="mt-1 flex flex-col items-center gap-1">
                  <div className="rounded border border-border bg-muted/30 px-3 py-1.5 text-center">
                    Data Key (DK)
                  </div>
                  <div className="text-muted-foreground text-[10px] text-center">random 256-bit key, stored encrypted; rotated only on wipe</div>
                </div>

                {/* DK → ciphertext */}
                <div className="mt-2 text-muted-foreground text-center">↓ XChaCha20-Poly1305 + random nonce + AAD(user_id)</div>
                <div className="mt-1 flex flex-col items-center gap-1">
                  <div className="rounded border border-green-500/40 bg-green-500/10 px-3 py-1.5 text-center text-green-600 font-semibold">
                    ciphertext
                  </div>
                  <div className="text-muted-foreground text-[10px] text-center">the only thing stored on the server — no keys, no plaintext</div>
                </div>
              </div>
            </div>
          </section>

          {/* What we protect against */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              What we defend against
            </h2>
            <ul className="space-y-2 list-disc pl-5">
              <li>
                <strong className="text-foreground">Database leaks.</strong>
                {' '}Our hosting provider (Supabase) only sees ciphertext.
                Anyone who steals a backup or the database itself sees
                ciphertext.
              </li>
              <li>
                <strong className="text-foreground">Hosting provider read access.</strong>
                {' '}Supabase staff cannot read your data, even with full
                database access.
              </li>
              <li>
                <strong className="text-foreground">Subpoenas of stored data.</strong>
                {' '}We can comply by handing over the encrypted blob — but
                the blob alone reveals nothing without your password.
              </li>
              <li>
                <strong className="text-foreground">Cross-user attacks.</strong>
                {' '}The encrypted blob is cryptographically bound to your
                user ID. Even with full database write access, an attacker
                cannot move one user's data into another user's account
                without it failing to decrypt.
              </li>
              <li>
                <strong className="text-foreground">Stolen / lost device, after sign-out.</strong>
                {' '}Your encryption key lives only in browser memory and
                is wiped on sign-out, tab close, and idle timeout.
              </li>
            </ul>
          </section>

          {/* What we DON'T protect against */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              What we do <em>not</em> protect against
            </h2>
            <p className="mb-3">
              These are real limits. We list them here because trustworthy
              encryption claims start with honest non-goals.
            </p>
            <ul className="space-y-2 list-disc pl-5">
              <li>
                <strong className="text-foreground">An actively malicious server.</strong>
                {' '}Every web app, including this one, downloads JavaScript
                from a server every time you visit. A compromised server
                could ship modified JS that exfiltrates your password as
                you type. Bitwarden, ProtonMail, Standard Notes — all
                web-based E2E systems share this limit. Mitigations
                (subresource integrity, signed bundles, native apps) are
                on the roadmap; not in v1.
              </li>
              <li>
                <strong className="text-foreground">A compromised device.</strong>
                {' '}Malware, keyloggers, and malicious browser extensions
                run with your privileges. No application can defend its
                own user from this.
              </li>
              <li>
                <strong className="text-foreground">Metadata.</strong>
                {' '}We can see that you have an account, your email, when
                you saved data, and roughly how big your portfolio JSON
                is. We can't see what's in it.
              </li>
              <li>
                <strong className="text-foreground">A forgotten password without a recovery code.</strong>
                {' '}If you forget your password and skipped the recovery
                code, your encrypted data is permanently unrecoverable.
                This is a property of true E2E encryption, not a bug.
              </li>
              <li>
                <strong className="text-foreground">Coercion.</strong>
                {' '}If someone forces you to disclose your password, they
                disclose everything.
              </li>
              <li>
                <strong className="text-foreground">A supply-chain attack on our dependencies.</strong>
                {' '}We pin lockfiles and review updates, but we are not
                immune.
              </li>
            </ul>
          </section>

          {/* Recovery */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Key className="h-4 w-4 text-primary" />
              Forgotten passwords and recovery codes
            </h2>
            <p className="mb-3">
              Because we cannot read your data, we cannot reset it for you.
              If you forget your password, the only way back in is a 24-word
              recovery code generated when you sign up.
            </p>
            <p className="mb-3">
              <strong className="text-foreground">Setting up a recovery code is opt-in.</strong>
              {' '}We strongly recommend you do. The code is a BIP-39 mnemonic
              with 256 bits of entropy. We display it once and never store it
              (only a wrapping derived from it). Save it somewhere offline —
              a printed copy, a safe, or a password manager.
            </p>
            <p className="mb-3">
              You can set up or rotate the recovery code from{' '}
              <Link to="/settings" className="text-primary hover:underline">
                Settings → Security
              </Link>
              .
            </p>
            <p className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-foreground/80">
              <strong className="text-foreground">A note on password reset.</strong>{' '}
              Resetting your password through the standard email flow rotates
              your account password, but it cannot rewrap your existing
              encrypted data — only your old password or your recovery code
              can do that. If you reset your password and you have a recovery
              code, we'll prompt you for it on next sign-in to restore access.
              If you reset your password and you skipped the recovery code,
              your previously encrypted snapshots become permanently
              unrecoverable. This is a property of true end-to-end encryption,
              not a bug.
            </p>
          </section>

          {/* Verifiability */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              Verify it yourself
            </h2>
            <p className="mb-3">
              We don't ask you to take our word for it. Both the design and
              the implementation are open and inspectable.
            </p>
            <ul className="space-y-2 list-disc pl-5">
              <li>
                <a
                  href={DESIGN_DOC_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Encryption design document
                  <ExternalLink className="h-3 w-3" />
                </a>
                {' '}— full threat model, primitive choices, key hierarchy,
                AAD framing, schema, and migration plan.
              </li>
              <li>
                <a
                  href={CRYPTO_MODULE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Crypto source code
                  <ExternalLink className="h-3 w-3" />
                </a>
                {' '}— small, pure functions; no I/O. Tests cover round-trip,
                tamper detection, AAD binding, and cross-user isolation.
              </li>
              <li>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Repository
                  <ExternalLink className="h-3 w-3" />
                </a>
                {' '}— full source. File issues if you find a problem.
              </li>
            </ul>
          </section>

          {/* Legal stuff */}
          <section className="rounded-xl border border-border bg-card/50 p-5">
            <h2 className="mb-2 text-sm font-semibold text-foreground">
              Disclosure and contact
            </h2>
            <p className="text-xs">
              If you find a security issue, please disclose it responsibly —
              do not open a public issue. Email{' '}
              <a
                href="mailto:hello@usequantive.app"
                className="text-primary hover:underline"
              >
                hello@usequantive.app
              </a>
              {' '}or use a{' '}
              <a
                href={REPO_URL + '/security/advisories/new'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                GitHub private advisory
              </a>
              .
            </p>
          </section>

        </div>
      </main>

      <Footer />
    </div>
  );
}
