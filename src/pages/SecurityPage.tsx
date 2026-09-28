import { Link } from 'react-router-dom';
import { PublicPage } from '@/components/landing/PublicPage';
import { usePageMeta } from '@/hooks/usePageMeta';
import { getRouteMeta } from '@/lib/seo/routeMeta';
import { analytics } from '@/lib/analytics';
import { KeyDiagram } from './security/KeyDiagram';
import '@/styles/doc.css';

const REPO_URL = 'https://github.com/pedromlsreis/quantive';
const DESIGN_DOC_URL = `${REPO_URL}/blob/main/docs/security/encryption.md`;
const CRYPTO_MODULE_URL = `${REPO_URL}/tree/main/src/lib/crypto`;

const SECTIONS = [
  { id: 'key-hierarchy', label: 'How your keys fit together' },
  { id: 'defends', label: 'What we defend against' },
  { id: 'does-not-defend', label: 'What we do not protect against' },
  { id: 'recovery', label: 'Recovery codes' },
  { id: 'verify', label: 'Verify it yourself' },
  { id: 'disclosure', label: 'Disclosure and accessibility' },
];

export default function SecurityPage() {
  usePageMeta(getRouteMeta('/security'));

  return (
    <PublicPage>
      <div className="pub-wrap doc">
        <header className="doc-head">
          <h1 className="pub-display">Security and encryption</h1>
          <p className="pub-lede sec-lede">
            Your portfolio is encrypted in your browser before it reaches our servers, so a full database leak would
            reveal nothing about your finances. It cannot protect you from a compromised server shipping modified code;
            that limit, and every other one, is listed below.
          </p>
          <div className="sec-meta">
            <p>
              <strong>Primitives:</strong> XChaCha20-Poly1305 for encryption, Argon2id for password-based key
              derivation, both via{' '}
              <a href="https://doc.libsodium.org/" target="_blank" rel="noopener noreferrer" className="pub-link">libsodium</a>.
            </p>
            <p>
              <strong>Third-party audit:</strong> not yet. Planned once revenue can fund it.
            </p>
          </div>
        </header>

        <div className="pub-doc">
          <nav className="pub-doc-toc" aria-label="On this page">
            <p className="pub-label">On this page</p>
            <ol>
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.label}</a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="pub-doc-body sec-body">
            <section id="key-hierarchy" aria-labelledby="h-keys">
              <h2 id="h-keys" className="doc-h2">How your keys fit together</h2>
              <figure className="sec-fig">
                <KeyDiagram />
                <figcaption>
                  Emerald outlines mark what you know or own. Everything below the dashed line is all our servers ever
                  store.
                </figcaption>
              </figure>
              <ol className="sec-steps">
                <li>
                  <strong>You type your password.</strong> Argon2id turns it and a salt into a key encryption key (KEK)
                  inside your browser. The password itself never leaves the page.
                </li>
                <li>
                  <strong>The KEK unwraps your data key,</strong> a random 256-bit key the server only ever stores in
                  wrapped form. If you set up a recovery code, it unwraps a second wrapped copy.
                </li>
                <li>
                  <strong>The data key encrypts your portfolio</strong> with XChaCha20-Poly1305, a fresh random nonce,
                  and authenticated data bound to your account ID.
                </li>
                <li>
                  <strong>Only ciphertext, the nonce, the salt and the wrapped keys reach our servers.</strong> The KEK
                  and data key live in memory and are wiped on sign-out, tab close and idle timeout.
                </li>
              </ol>
            </section>

            <section id="defends" aria-labelledby="h-defends">
              <h2 id="h-defends" className="doc-h2">What we defend against</h2>
              <ul className="sec-ledger" role="list">
                <li>
                  <strong>Database leaks.</strong> Our hosting provider (Supabase) only sees ciphertext. Anyone who
                  steals a backup or the database itself sees ciphertext.
                </li>
                <li>
                  <strong>Hosting provider read access.</strong> Supabase staff cannot read your data, even with full
                  database access.
                </li>
                <li>
                  <strong>Subpoenas of stored data.</strong> We can comply by handing over the encrypted blob, but the
                  blob alone reveals nothing without your password.
                </li>
                <li>
                  <strong>Cross-user attacks.</strong> The encrypted blob is cryptographically bound to your user ID.
                  Even with full database write access, an attacker cannot move one user's data into another user's
                  account without it failing to decrypt.
                </li>
                <li>
                  <strong>A stolen or lost device, after sign-out.</strong> Your encryption key lives only in browser
                  memory and is wiped on sign-out, tab close and idle timeout.
                </li>
                <li>
                  <strong>Automated attacks on the login.</strong> Sign-up and sign-in are rate-limited and gated by a
                  CAPTCHA (Cloudflare Turnstile), which blunts bot sign-ups and credential-stuffing attempts.
                </li>
              </ul>
            </section>

            <section id="does-not-defend" aria-labelledby="h-not">
              <h2 id="h-not" className="doc-h2">What we do not protect against</h2>
              <p>These are real limits. We list them so you can weigh the protections above against them.</p>
              <ul className="sec-ledger sec-ledger--no" role="list">
                <li>
                  <strong>An actively malicious server.</strong> Every web app, including this one, downloads
                  JavaScript from a server on every visit. A compromised server could ship modified code that
                  exfiltrates your password as you type. Bitwarden, Proton Mail and Standard Notes share this limit,
                  as does every web-based end-to-end encrypted service. Our first-party code ships as hashed, immutable assets, so replacing the bytes requires a
                  deploy by us. Signed builds and a native client remain the stronger mitigation. Subresource integrity
                  is{' '}
                  <a
                    href={`${REPO_URL}/blob/main/docs/security/sri-policy.md`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pub-link"
                  >
                    not applied to our third-party origins
                  </a>{' '}
                  because the vendors do not publish per-version content hashes, and a pinned hash would break on the
                  next silent rotation.
                </li>
                <li>
                  <strong>A compromised device.</strong> Malware, keyloggers and malicious browser extensions run with
                  your privileges. No application can defend its own user from this.
                </li>
                <li>
                  <strong>Metadata.</strong> We can see that you have an account, your email, when you saved data, and
                  roughly how big your portfolio is. We can't see what's in it.
                </li>
                <li>
                  <strong>A forgotten password without a recovery code.</strong> If you forget your password and skipped
                  the recovery code, your encrypted data is permanently unrecoverable. Nobody else holds a key that can
                  decrypt it, including us.
                </li>
                <li>
                  <strong>Coercion.</strong> If someone forces you to disclose your password, they disclose everything.
                </li>
                <li>
                  <strong>A supply-chain attack on our dependencies.</strong> We pin lockfiles and review updates, but
                  we are not immune.
                </li>
              </ul>
            </section>

            <section id="recovery" aria-labelledby="h-recovery">
              <h2 id="h-recovery" className="doc-h2">Forgotten passwords and recovery codes</h2>
              <p>
                Because we cannot read your data, we cannot reset it for you. If you forget your password, the only way
                back in is a 24-word recovery code, if you set one up.
              </p>
              <p style={{ marginTop: '1em' }}>
                <strong>Setting up a recovery code is opt-in,</strong> and we strongly
                recommend it. The code is a BIP-39 mnemonic with 256 bits of entropy. We display it once and never
                store it (only a wrapping derived from it). Save it somewhere offline: a printed copy, a safe or a
                password manager. You can set up or rotate it from{' '}
                <Link to="/settings" className="pub-link">Settings, under Security</Link>.
              </p>
              <div className="sec-note">
                <span className="pub-label">A note on password reset</span>
                Resetting your password through the email flow changes your account password, but it cannot rewrap
                your existing encrypted data: only your old password or your recovery code can do that. If you reset
                your password and have a recovery code, we'll ask for it on your next sign-in to restore access. If you
                reset your password and skipped the recovery code, your previously encrypted snapshots become
                permanently unrecoverable.
              </div>
            </section>

            <section id="verify" aria-labelledby="h-verify">
              <h2 id="h-verify" className="doc-h2">Verify it yourself</h2>
              <p>The design and the implementation are open to inspection.</p>
              <dl className="sec-index">
                <div>
                  <dt>
                    <a href={DESIGN_DOC_URL} target="_blank" rel="noopener noreferrer" className="pub-link">Encryption design document</a>
                  </dt>
                  <dd>Threat model, primitive choices, key hierarchy, AAD framing, schema and migration plan.</dd>
                </div>
                <div>
                  <dt>
                    <a href={CRYPTO_MODULE_URL} target="_blank" rel="noopener noreferrer" className="pub-link">Crypto source code (MIT)</a>
                  </dt>
                  <dd>Small, pure functions with no I/O. Tests cover round-trip, tamper detection, AAD binding and cross-user isolation.</dd>
                </div>
                <div>
                  <dt>
                    <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="pub-link">Repository</a>
                  </dt>
                  <dd>The full source. File an issue if you find a problem.</dd>
                </div>
              </dl>
            </section>

            <section id="disclosure" aria-labelledby="h-disclosure" className="sec-small">
              <div>
                <h2 id="h-disclosure" className="doc-h2">Disclosure and contact</h2>
                <p>
                  If you find a security issue, please disclose it responsibly and do not open a public issue. Email{' '}
                  <a href="mailto:support@usequantive.app" className="pub-link">support@usequantive.app</a> or use a{' '}
                  <a href={`${REPO_URL}/security/advisories/new`} target="_blank" rel="noopener noreferrer" className="pub-link">
                    GitHub private advisory
                  </a>
                  .
                </p>
              </div>
              <div>
                <h2 className="doc-h2">Accessibility</h2>
                <p>
                  Quantive aims to follow WCAG 2.1 AA. As a micro-business under EU criteria we are not subject to formal
                  conformance reporting, but we treat accessibility as a baseline quality bar. If you run into an issue,
                  email <a href="mailto:legal@usequantive.app" className="pub-link">legal@usequantive.app</a>.
                </p>
              </div>
            </section>

            <div className="sec-next">
              <p>Try the app with illustrative data, or start your own record.</p>
              <div className="lp-actions">
                <Link
                  to="/dashboard"
                  className="pub-btn pub-btn--primary"
                  onClick={() => analytics.landingCtaClicked({ cta: 'get_started', location: 'security' })}
                >
                  Get started free
                </Link>
                <Link
                  to="/demo"
                  className="pub-btn pub-btn--secondary"
                  onClick={() => analytics.landingCtaClicked({ cta: 'try_demo', location: 'security' })}
                >
                  Try the demo
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PublicPage>
  );
}
