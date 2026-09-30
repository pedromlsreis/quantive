import { Link } from 'react-router-dom';
import { Wordmark } from '@/components/layout/Brand';
import { analytics } from '@/lib/analytics';

const REPO_URL = 'https://github.com/pedromlsreis/quantive';

/**
 * Colophon for the public pages. Kept separate from the app shell's thin
 * Footer so it stays out of the main bundle. Link names are unique within
 * the landmark (tests match ^Security$, ^Privacy$, ^Terms$, ^Impressum$).
 */
export function PublicFooter() {
  return (
    <footer className="pub-footer">
      <div className="pub-wrap">
        <div className="pub-footer-grid">
          <div className="pub-footer-brand">
            <Link to="/" aria-label="Quantive, back to the homepage" className="inline-flex min-h-11 items-center">
              <Wordmark size={20} />
            </Link>
            <p>An end-to-end encrypted net worth tracker.</p>
          </div>
          <div className="pub-footer-cols">
            <div className="pub-footer-col">
              <p className="pub-label">Product</p>
              <ul>
                <li><Link to="/#features">Features</Link></li>
                <li><Link to="/pricing">Pricing</Link></li>
                <li>
                  <Link to="/demo" onClick={() => analytics.landingCtaClicked({ cta: 'try_demo', location: 'footer_nav' })}>
                    Demo
                  </Link>
                </li>
              </ul>
            </div>
            <div className="pub-footer-col">
              <p className="pub-label">Trust</p>
              <ul>
                <li><Link to="/security">Security</Link></li>
                <li>
                  <a href={`${REPO_URL}/blob/main/docs/security/encryption.md`} target="_blank" rel="noopener noreferrer">
                    Encryption design
                  </a>
                </li>
                <li>
                  <a href={`${REPO_URL}/tree/main/src/lib/crypto`} target="_blank" rel="noopener noreferrer">
                    Crypto source (MIT)
                  </a>
                </li>
                <li><Link to="/security#disclosure">Report a vulnerability</Link></li>
              </ul>
            </div>
            <div className="pub-footer-col">
              <p className="pub-label">Legal</p>
              <ul>
                <li><Link to="/privacy">Privacy</Link></li>
                <li><Link to="/terms">Terms</Link></li>
                <li><Link to="/impressum">Impressum</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="pub-footer-base">
          <span>© {new Date().getFullYear()} Quantive</span>
          <span>Cryptography MIT-licensed. The rest is source-available.</span>
        </div>
      </div>
    </footer>
  );
}
