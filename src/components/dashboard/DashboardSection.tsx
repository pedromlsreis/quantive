import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

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
      >
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 transition-colors group-hover:text-muted-foreground">
          {title}
        </h2>
        <div className="h-px flex-1 bg-border" />
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground/50 transition-transform duration-200 ${
            open ? 'rotate-0' : '-rotate-90'
          }`}
        />
      </button>
      {open && <div className="space-y-6 animate-fade-in">{children}</div>}
    </section>
  );
}
