import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  /** The label/element that triggers the hint (must be focusable, e.g. a `<button>`). */
  children: ReactNode;
  /** The explanatory content shown on hover (desktop) or tap (touch). */
  content: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Max width applied to the bubble. */
  maxWidthClass?: string;
  /** Optional classes applied to the trigger wrapper (the element that participates in flex/grid layout). */
  triggerWrapperClassName?: string;
}

/**
 * Help affordance that opens on hover (desktop) and on tap (touch). Built on a
 * single Radix Popover so behavior is identical across devices — we just wire
 * pointer events on top to give desktop users a hover-to-peek experience.
 */
export function HelpHint({ children, content, side = 'top', maxWidthClass = 'max-w-[260px]', triggerWrapperClassName }: HelpHintProps) {
  const touch = useIsTouchPrimary();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = (delay = 120) => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), delay);
  };

  useEffect(() => () => cancelClose(), []);

  // On touch devices we rely purely on tap (Popover's default click-to-open);
  // on hover-capable devices we also open on pointer enter / close on pointer leave.
  const hoverProps = touch
    ? {}
    : {
        onPointerEnter: () => {
          cancelClose();
          setOpen(true);
        },
        onPointerLeave: () => scheduleClose(),
        onFocus: () => {
          cancelClose();
          setOpen(true);
        },
        onBlur: () => scheduleClose(0),
      };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span {...hoverProps} className={triggerWrapperClassName ?? 'inline-flex'}>
          {children}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        className={`${maxWidthClass} z-[100] w-auto p-3 text-xs leading-relaxed`}
        onPointerEnter={touch ? undefined : cancelClose}
        onPointerLeave={touch ? undefined : () => scheduleClose()}
        onOpenAutoFocus={(e) => {
          // On desktop hover, don't steal focus from underlying inputs.
          if (!touch) e.preventDefault();
        }}
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}
