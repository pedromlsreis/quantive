import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { softSpring, collapseContent } from '@/lib/motion';
import { ErrorBoundary } from '@/components/ErrorBoundary';

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
        type="button"
        onClick={() => setOpen(!open)}
        className="q-section-eyebrow"
        aria-expanded={open}
        aria-controls={`${id}-content`}
      >
        <h2 className="q-section-eyebrow-label">{title}</h2>
        <div className="q-section-eyebrow-rule" />
        <motion.div
          className="q-section-eyebrow-chev"
          animate={{ rotate: open ? 0 : -90 }}
          transition={softSpring}
        >
          <ChevronDown className="h-4 w-4" />
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
            <ErrorBoundary>{children}</ErrorBoundary>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
