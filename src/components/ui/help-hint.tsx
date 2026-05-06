import { useEffect, useState, type ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

function useIsTouchPrimary() {
  const [touch, setTouch] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(hover: none)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(hover: none)');
    const onChange = (e: MediaQueryListEvent) => setTouch(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return touch;
}

interface HelpHintProps {
  /** The label/element that triggers the hint (e.g. a `<label>`). */
  children: ReactNode;
  /** The explanatory content shown on hover (desktop) or tap (touch). */
  content: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Max width applied to both Tooltip and Popover bubbles. */
  maxWidthClass?: string;
}

/**
 * Hover-on-desktop, tap-on-mobile help affordance. Same explanatory content,
 * different primitive depending on whether the device has a hover-capable pointer.
 */
export function HelpHint({ children, content, side = 'top', maxWidthClass = 'max-w-[260px]' }: HelpHintProps) {
  const touch = useIsTouchPrimary();

  if (touch) {
    return (
      <Popover>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent side={side} className={`${maxWidthClass} w-auto p-3 text-xs leading-relaxed`}>
          {content}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} className={`${maxWidthClass} text-xs leading-relaxed`}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
