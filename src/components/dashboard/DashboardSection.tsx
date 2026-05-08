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
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 transition-colors group-hover:text-muted-foreground">
          {title}
        </h2>
        <div className="h-px flex-1 bg-border" />
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
