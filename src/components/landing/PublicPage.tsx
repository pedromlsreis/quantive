import type { ReactNode } from 'react';
import { StickyNav } from '@/components/landing/StickyNav';
import { PublicFooter } from '@/components/landing/PublicFooter';
import { useMotionAllowed } from '@/hooks/useMotionAllowed';
import '@/styles/public.css';

/** Shared chrome for every public page: one root, one nav, one colophon. */
export function PublicPage({ children, className = '' }: { children: ReactNode; className?: string }) {
  const motion = useMotionAllowed();
  return (
    <div className={`pub-root flex min-h-screen flex-col ${className}`} data-motion={motion ? 'on' : undefined}>
      <StickyNav />
      <main id="main-content" className="pub-main">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
