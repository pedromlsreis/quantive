import type { Variants, Transition } from 'framer-motion';

// ─── Transitions ───────────────────────────────────────────────────────────

export const springTransition: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
};

export const softSpring: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 28,
};

export const easeOut: Transition = {
  duration: 0.25,
  ease: [0.16, 1, 0.3, 1],
};

export const fastEaseOut: Transition = {
  duration: 0.18,
  ease: [0.16, 1, 0.3, 1],
};

// ─── Base variants ─────────────────────────────────────────────────────────

export const fadeIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: easeOut },
  exit: { opacity: 0, y: -4, transition: fastEaseOut },
};

export const fadeInScale: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 4 },
  visible: { opacity: 1, scale: 1, y: 0, transition: easeOut },
  exit: { opacity: 0, scale: 0.97, transition: fastEaseOut },
};

export const slideInFromTop: Variants = {
  hidden: { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0, transition: easeOut },
  exit: { opacity: 0, y: -8, transition: fastEaseOut },
};

// ─── List/stagger container ─────────────────────────────────────────────────

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { ...softSpring },
  },
};

// ─── Modal / overlay ────────────────────────────────────────────────────────

export const modalOverlay: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const modalContent: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { ...softSpring, delay: 0.04 },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 4,
    transition: { duration: 0.15, ease: 'easeIn' },
  },
};

// ─── Section collapse/expand ────────────────────────────────────────────────

export const collapseContent: Variants = {
  hidden: { opacity: 0, height: 0 },
  visible: {
    opacity: 1,
    height: 'auto',
    transition: {
      height: { type: 'spring', stiffness: 280, damping: 28 },
      opacity: { duration: 0.2, delay: 0.05 },
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: {
      height: { duration: 0.2, ease: 'easeIn' },
      opacity: { duration: 0.12 },
    },
  },
};

// ─── Inline banner (validation errors, notices) ────────────────────────────

export const errorBanner: Variants = {
  hidden: { opacity: 0, height: 0 },
  visible: {
    opacity: 1,
    height: 'auto',
    transition: {
      height: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
      opacity: { duration: 0.15 },
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: { height: { duration: 0.14, ease: 'easeIn' }, opacity: { duration: 0.1 } },
  },
};

// ─── Progress bar fill ──────────────────────────────────────────────────────

export const progressFill = (targetWidth: number, delay = 0.2): Variants => ({
  hidden: { width: '0%' },
  visible: {
    width: `${targetWidth}%`,
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1], delay },
  },
});
