import { Children, isValidElement, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { PublicPage } from '@/components/landing/PublicPage';
import { usePageMeta } from '@/hooks/usePageMeta';
import '@/styles/doc.css';

interface MarkdownLegalProps {
  /** Raw markdown source. Pass via `import doc from '@/.../foo.md?raw'`. */
  source: string;
  /** Used for <title> and canonical URL. */
  pageTitle: string;
  /** Meta description for SEO. */
  pageDescription: string;
  /** Canonical path, e.g. "/privacy". */
  path: string;
}

// One shared wrapper for all markdown-backed legal pages: privacy, terms,
// Impressum. Renders the markdown source verbatim so the file under
// docs/legal/ is the single source of truth. Presentation (contents rail,
// hanging section numbers, the "Last updated" meta line) is layered on
// without editing the text.
export function MarkdownLegal({ source, pageTitle, pageDescription, path }: MarkdownLegalProps) {
  usePageMeta({ title: pageTitle, description: pageDescription, path });

  const { title, updated, body } = useMemo(() => splitDoc(stripLeadingComment(source)), [source]);
  const toc = useMemo(() => headingsOf(body), [body]);
  // Short documents (the Impressum) read better without a contents rail.
  const showToc = toc.length >= 5;
  const active = useActiveHeading(showToc ? toc.map((h) => h.id) : []);

  return (
    <PublicPage>
      <div className="pub-wrap doc">
        <header className="doc-head">
          <h1 className="pub-display">{title}</h1>
          {updated && <p className="pub-kicker doc-updated">{updated}</p>}
          {path === '/privacy' && (
            <p className="doc-aside">
              How your portfolio is encrypted is documented on the{' '}
              <Link to="/security" className="pub-link">security page</Link>.
            </p>
          )}
        </header>

        <div className={showToc ? 'pub-doc' : undefined}>
          {showToc && (
            <nav className="pub-doc-toc" aria-label="On this page">
              <p className="pub-label">On this page</p>
              <ol>
                {toc.map((h) => (
                  <li key={h.id}>
                    <a href={`#${h.id}`} aria-current={active === h.id ? 'true' : undefined}>
                      {h.text}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <div className="pub-doc-body doc-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={{
                h2: ({ children }) => {
                  const text = textOf(children);
                  const numbered = text.match(/^(\d+)\.\s+(.*)$/);
                  return (
                    <h2 id={slug(text)} className="doc-h2">
                      {numbered ? (
                        <>
                          <span className="doc-num">{numbered[1]}.</span> {numbered[2]}
                        </>
                      ) : (
                        children
                      )}
                    </h2>
                  );
                },
                a: ({ href, children, ...props }) => {
                  const isExternal = href?.startsWith('http');
                  return (
                    <a
                      href={href}
                      className="pub-link"
                      {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      {...props}
                    >
                      {children}
                    </a>
                  );
                },
              }}
            >
              {body}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </PublicPage>
  );
}

/** Marks the heading nearest the top of the viewport as the current section. */
function useActiveHeading(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join('|');
  useEffect(() => {
    if (!key || typeof IntersectionObserver === 'undefined') return;
    const els = key.split('|').map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -65% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [key]);
  return active;
}

function stripLeadingComment(md: string): string {
  return md.replace(/^<!--[\s\S]*?-->\s*/m, '');
}

function splitDoc(md: string): { title: string; updated: string | null; body: string } {
  const match = md.match(/^#\s+(.+)\s*\n/);
  const title = match ? match[1].trim() : 'Legal';
  let body = match ? md.slice(match[0].length).trimStart() : md;
  // A leading "_Last updated: …_" line becomes the page's meta line.
  const updated = body.match(/^[_*](Last updated:[^_*\n]+)[_*]\s*\n/);
  if (updated) body = body.slice(updated[0].length).trimStart();
  return { title, updated: updated ? updated[1].trim() : null, body };
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/^\d+\.\s+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function headingsOf(body: string): { id: string; text: string }[] {
  const seen = new Set<string>();
  const out: { id: string; text: string }[] = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (!m) continue;
    const text = m[1].replace(/[*_`]/g, '');
    const id = slug(text);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, text: text.replace(/^\d+\.\s+/, '') });
  }
  return out;
}

function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child);
      if (isValidElement<{ children?: ReactNode }>(child)) return textOf(child.props.children);
      return '';
    })
    .join('');
}
