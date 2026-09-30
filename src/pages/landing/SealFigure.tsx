import { useEffect, useRef, useState } from 'react';
import { RollingFigure } from '@/components/landing/RollingFigure';
import { buildInstrument, money, type DisplayCurrency } from './instrumentData';
import {
  SEAL_CIPHERTEXT_HEX,
  SEAL_DEMO_KEY_HEX,
  SEAL_NONCE_HEX,
  SEAL_PLAINTEXT,
  SEAL_TAG_BYTES,
  SEAL_USER_ID,
} from './sealFixture';

const BODY_HEX = SEAL_CIPHERTEXT_HEX.slice(0, SEAL_CIPHERTEXT_HEX.length - SEAL_TAG_BYTES * 2);
const TAG_HEX = SEAL_CIPHERTEXT_HEX.slice(-SEAL_TAG_BYTES * 2);
const BODY_BYTES = BODY_HEX.length / 2;
const PLAIN_HEX = Array.from(SEAL_PLAINTEXT, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');

const byteAt = (hex: string, i: number) => hex.slice(i * 2, i * 2 + 2);

/** 8-byte groups, the way a hex dump reads. */
function groups(byteCount: number, render: (i: number) => string) {
  const out: string[] = [];
  for (let g = 0; g < byteCount; g += 8) {
    let s = '';
    for (let i = g; i < Math.min(g + 8, byteCount); i++) s += render(i);
    out.push(s);
  }
  return out;
}

const LockIcon = (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <rect x="3" y="8" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="9" cy="13" r="1.2" fill="currentColor" />
  </svg>
);

/** The stored JSON with values set apart from keys and punctuation. */
function Payload() {
  const parts = SEAL_PLAINTEXT.split(/("(?:[^"\\]|\\.)*"|[\d.]+)/g).filter(Boolean);
  let expectValue = false;
  return (
    <code className="lp-seal-json" translate="no">
      {parts.map((p, i) => {
        const isToken = /^"|^[\d.]+$/.test(p);
        if (!isToken) {
          expectValue = p.includes(':');
          return (
            <span key={i}>
              {p}
              {p.includes(',') && <wbr />}
            </span>
          );
        }
        const isValue = expectValue;
        expectValue = false;
        return <span key={i} className={isValue ? 'lp-seal-val' : undefined}>{p}</span>;
      })}
    </code>
  );
}

/**
 * Plaintext on one side, what the database stores on the other. The bytes are
 * genuine (sealFixture.test.ts). When motion is allowed and the figure starts
 * fully below the viewport, it plays once: the nonce appears, each body byte
 * flips once from its plaintext value to its ciphertext value (a stream
 * cipher works byte by byte), and the tag lands last.
 */
export function SealFigure({ currency, month, motion }: { currency: DisplayCurrency; month: number; motion: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const dumpRef = useRef<HTMLDListElement>(null);
  // null = final state (prerender, reduced motion, already on screen)
  const [swept, setSwept] = useState<number | null>(null);
  const [tagShown, setTagShown] = useState(true);
  const total = buildInstrument(month, currency).total;

  useEffect(() => {
    const el = dumpRef.current;
    if (!motion || !el || typeof IntersectionObserver === 'undefined') return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setSwept(-1);
    setTagShown(false);
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          // Scrolled past without playing (e.g. a fast jump): show the real bytes.
          if (entry.boundingClientRect.bottom < 0) {
            io.disconnect();
            setSwept(null);
            setTagShown(true);
          }
          return;
        }
        io.disconnect();
        const start = performance.now() + 250;
        const tick = (now: number) => {
          const t = (now - start) / 1000;
          setSwept(t < 0 ? 0 : Math.min(BODY_BYTES, Math.floor(t * BODY_BYTES)));
          if (t < 1) raf = requestAnimationFrame(tick);
          else setTagShown(true);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [motion]);

  const done = swept === null ? BODY_BYTES : Math.max(0, swept);
  const nonceShown = swept === null || swept >= 0;
  const bodyGroups: { sealed: string; plain: string }[] = [];
  for (let g = 0; g < BODY_BYTES; g += 8) {
    let sealed = '';
    let plain = '';
    for (let i = g; i < Math.min(g + 8, BODY_BYTES); i++) {
      if (i < done) sealed += byteAt(BODY_HEX, i);
      else plain += byteAt(PLAIN_HEX, i);
    }
    bodyGroups.push({ sealed, plain });
  }

  return (
    <figure ref={ref} className="lp-seal">
      <div className="lp-seal-side">
        <p className="pub-label">In your browser</p>
        <p className="lp-seal-total">
          <RollingFigure value={money(total, currency)} className="pub-fig" group={currency} />
        </p>
        <div className="pub-double-rule" aria-hidden="true" />
        <p className="lp-seal-note">One of the entries behind that number, as the app stores it:</p>
        <Payload />
      </div>

      <div className="lp-seal-boundary">
        <span className="lp-seal-lock">{LockIcon}</span>
        <span className="lp-seal-boundary-label">
          <span className="lp-nowrap">XChaCha20-Poly1305</span>
          <br />
          data key unlocked by your password (Argon2id)
        </span>
      </div>

      <div className="lp-seal-side">
        <p className="pub-label">What our database stores</p>
        <dl ref={dumpRef} className="lp-seal-dump" translate="no">
          <div>
            <dt>nonce · 24 bytes, random per save</dt>
            <dd className={nonceShown ? '' : 'is-pending'}>{groups(24, (i) => byteAt(SEAL_NONCE_HEX, i)).join(' ')}</dd>
          </div>
          <div>
            <dt>ciphertext · {BODY_BYTES} bytes, as long as your data</dt>
            <dd>
              {bodyGroups.map((g, gi) => (
                <span key={gi}>
                  {g.sealed}
                  {g.plain && <span className="lp-seal-plain">{g.plain}</span>}{' '}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt>tag · {SEAL_TAG_BYTES} bytes, fails if anything changes</dt>
            <dd className={tagShown ? 'lp-seal-tag' : 'lp-seal-tag is-pending'}>
              {groups(SEAL_TAG_BYTES, (i) => byteAt(TAG_HEX, i)).join(' ')}
            </dd>
          </div>
        </dl>
      </div>
    </figure>
  );
}

/** The public decrypt recipe for the seal's bytes. */
export function SealVerify() {
  return (
    <details className="lp-seal-verify">
      <summary>Verify it yourself</summary>
      <div className="lp-seal-verify-body">
        <p>
          These bytes are real output of the app's encryption module, made with a throwaway key published here on
          purpose. The authenticated data binds the ciphertext to one account ID, so the same bytes fail to decrypt
          anywhere else. Decrypt them with libsodium:
        </p>
        <pre translate="no">{`import sodium from 'libsodium-wrappers-sumo';
await sodium.ready;
const hex = sodium.from_hex;
const key   = hex('${SEAL_DEMO_KEY_HEX}');
const nonce = hex('${SEAL_NONCE_HEX}');
// "nwa-snap-v1" ‖ 0x00 ‖ account id ‖ encryption version (u32, little-endian)
const aad = new Uint8Array([...sodium.from_string('nwa-snap-v1'), 0,
  ...hex('${SEAL_USER_ID.replace(/-/g, '')}'), 1, 0, 0, 0]);
const ciphertext = hex('${SEAL_CIPHERTEXT_HEX}');
sodium.to_string(sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
  null, ciphertext, aad, nonce, key));`}</pre>
      </div>
    </details>
  );
}
