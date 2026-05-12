import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { softSpring, collapseContent } from '@/lib/motion';

interface DashboardSectionProps {
  id: string;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function DashboardSection({ id, title, children, defaultOpen = true }: DashboardSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section id={id} className="space-y-6">
      <button
        onClick={() => setOpen(!open)}
        className="group flex w-full items-center gap-3 text-left"
        aria-expanded={open}
        aria-controls={`${id}-content`}
      >
        <h2 style={{
          fontSize: 'var(--text-xs)', fontWeight: 500,
          textTransform: 'uppercase', letterSpacing: '0.06em',
          color: 'var(--fg-faint)',
          transition: `color var(--d-fast) var(--ease-soft)`,
        }}
          className="group-hover:text-muted-foreground transition-colors"
        >
          {title}
        </h2>
        <div style={{ flex: 1, height: 1, background: 'var(--border-raw)' }} />
        <motion.div
          animate={{ rotate: open ? 0 : -90 }}
          transition={softSpring}
        >
          <ChevronDown className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground/70 transition-colors" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`${id}-content`}
            key="content"
            variants={collapseContent}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="overflow-hidden space-y-6"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
