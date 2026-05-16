import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { StickyNav } from '@/components/landing/StickyNav';
import { Footer } from '@/components/Footer';
import { usePageMeta } from '@/hooks/usePageMeta';

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
// docs/legal/ is the single source of truth — no JSX drift possible.
export function MarkdownLegal({ source, pageTitle, pageDescription, path }: MarkdownLegalProps) {
  usePageMeta({ title: pageTitle, description: pageDescription, path });

  // Strip a leading HTML comment line if present (e.g. "Keep in sync" hints
  // we no longer need now that markdown is canonical). Then drop the level-1
  // heading from the body — we render it as a styled <h1> in the chrome.
  const { title, body } = useMemo(() => splitTitle(stripLeadingComment(source)), [source]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <StickyNav />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-20">
        <h1 className="mb-6 text-3xl font-bold text-foreground">{title}</h1>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground [&_h2]:text-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-foreground [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_strong]:text-foreground [&_table]:w-full [&_table]:text-xs [&_th]:text-left [&_th]:text-foreground [&_th]:font-semibold [&_th]:p-2 [&_th]:border-b [&_th]:border-border [&_td]:p-2 [&_td]:border-b [&_td]:border-border/50 [&_td]:align-top [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_code]:text-xs [&_code]:bg-muted/30 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={{
              a: ({ href, children, ...props }) => {
                const isExternal = href?.startsWith('http');
                return (
                  <a
                    href={href}
                    className="text-primary hover:underline"
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
      </main>

      <Footer />
    </div>
  );
}

function stripLeadingComment(md: string): string {
  return md.replace(/^<!--[\s\S]*?-->\s*/m, '');
}

function splitTitle(md: string): { title: string; body: string } {
  const match = md.match(/^#\s+(.+)\s*\n/);
  if (!match) return { title: 'Legal', body: md };
  return {
    title: match[1].trim(),
    body: md.slice(match[0].length).trimStart(),
  };
}
