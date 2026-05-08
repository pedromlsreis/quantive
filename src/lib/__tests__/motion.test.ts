import { describe, it, expect } from 'vitest';
import {
  fadeIn,
  fadeInScale,
  staggerContainer,
  staggerItem,
  modalOverlay,
  modalContent,
  collapseContent,
  progressFill,
  springTransition,
  softSpring,
  easeOut,
  fastEaseOut,
} from '@/lib/motion';

describe('motion variants', () => {
  describe('fadeIn', () => {
    it('has hidden, visible, and exit states', () => {
      expect(fadeIn).toHaveProperty('hidden');
      expect(fadeIn).toHaveProperty('visible');
      expect(fadeIn).toHaveProperty('exit');
    });

    it('hidden state starts with opacity 0', () => {
      expect((fadeIn.hidden as Record<string, unknown>).opacity).toBe(0);
    });

    it('visible state has opacity 1 and y 0', () => {
      const visible = fadeIn.visible as Record<string, unknown>;
      expect(visible.opacity).toBe(1);
      expect(visible.y).toBe(0);
    });
  });

  describe('fadeInScale', () => {
    it('hidden state has reduced scale', () => {
      const hidden = fadeInScale.hidden as Record<string, unknown>;
      expect(hidden.scale).toBeLessThan(1);
    });

    it('visible state has scale 1', () => {
      const visible = fadeInScale.visible as Record<string, unknown>;
      expect(visible.scale).toBe(1);
    });
  });

  describe('staggerContainer', () => {
    it('visible state has staggerChildren', () => {
      const visible = staggerContainer.visible as { transition?: Record<string, unknown> };
      expect(visible.transition?.staggerChildren).toBeGreaterThan(0);
    });

    it('stagger interval is in the 30–80ms range per UI/UX guidelines', () => {
      const visible = staggerContainer.visible as { transition?: { staggerChildren: number } };
      const ms = (visible.transition?.staggerChildren ?? 0) * 1000;
      expect(ms).toBeGreaterThanOrEqual(30);
      expect(ms).toBeLessThanOrEqual(80);
    });
  });

  describe('staggerItem', () => {
    it('starts hidden (opacity 0)', () => {
      expect((staggerItem.hidden as Record<string, unknown>).opacity).toBe(0);
    });

    it('becomes fully visible', () => {
      expect((staggerItem.visible as Record<string, unknown>).opacity).toBe(1);
    });
  });

  describe('modalOverlay', () => {
    it('fades in and out', () => {
      expect((modalOverlay.hidden as Record<string, unknown>).opacity).toBe(0);
      expect((modalOverlay.visible as Record<string, unknown>).opacity).toBe(1);
      expect((modalOverlay.exit as Record<string, unknown>).opacity).toBe(0);
    });
  });

  describe('modalContent', () => {
    it('hidden state has scale < 1', () => {
      expect((modalContent.hidden as Record<string, unknown>).scale).toBeLessThan(1);
    });

    it('exit is faster than enter (exit-faster-than-enter pattern)', () => {
      const visibleTransition = (modalContent.visible as { transition?: { stiffness?: number } }).transition;
      const exitTransition = (modalContent.exit as { transition?: { duration?: number } }).transition;
      // Enter uses spring (no explicit duration); exit uses explicit duration
      expect(exitTransition?.duration).toBeLessThan(0.3);
      expect(visibleTransition).toBeTruthy();
    });
  });

  describe('collapseContent', () => {
    it('hidden state has height 0', () => {
      expect((collapseContent.hidden as Record<string, unknown>).height).toBe(0);
    });

    it('visible state has height "auto"', () => {
      expect((collapseContent.visible as Record<string, unknown>).height).toBe('auto');
    });
  });

  describe('progressFill', () => {
    it('returns variant with hidden width 0%', () => {
      const variant = progressFill(75);
      expect((variant.hidden as Record<string, unknown>).width).toBe('0%');
    });

    it('returns variant with visible width equal to target', () => {
      const variant = progressFill(75);
      expect((variant.visible as Record<string, unknown>).width).toBe('75%');
    });

    it('clamps correctly for 100%', () => {
      const variant = progressFill(100);
      expect((variant.visible as Record<string, unknown>).width).toBe('100%');
    });
  });

  describe('transitions', () => {
    it('springTransition uses spring type', () => {
      expect(springTransition.type).toBe('spring');
    });

    it('softSpring uses spring type', () => {
      expect(softSpring.type).toBe('spring');
    });

    it('easeOut duration is within 150–300ms', () => {
      const ms = (easeOut.duration ?? 0) * 1000;
      expect(ms).toBeGreaterThanOrEqual(150);
      expect(ms).toBeLessThanOrEqual(300);
    });

    it('fastEaseOut is faster than easeOut', () => {
      expect((fastEaseOut.duration ?? 1)).toBeLessThan((easeOut.duration ?? 0));
    });
  });
});
