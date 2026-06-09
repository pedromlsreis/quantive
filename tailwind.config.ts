import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // ── Typography ───────────────────────────────────────────
      fontFamily: {
        // body: Geist sans (locked)
        sans: ['"Geist"', '"Inter Tight"', 'system-ui', 'sans-serif'],
        // display: JetBrains Mono (locked: mono type pairing)
        display: ['"JetBrains Mono"', '"Geist Mono"', 'ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
        // mono: JetBrains Mono
        mono: ['"JetBrains Mono"', '"Geist Mono"', 'ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
        // serif: Fraunces variable (marketing display face on landing)
        serif: ['"Fraunces Variable"', '"Fraunces"', '"Source Serif 4"', 'Georgia', 'serif'],
      },

      // ── Type scale (modular, from design tokens) ─────────────
      fontSize: {
        // Keep Tailwind defaults, add q-* design scale
        'q-xs':      ['0.6875rem', { lineHeight: '1.5',  letterSpacing: '0' }],      // 11px
        'q-sm':      ['0.8125rem', { lineHeight: '1.5',  letterSpacing: '0' }],      // 13px
        'q-base':    ['0.9375rem', { lineHeight: '1.5',  letterSpacing: '0' }],      // 15px
        'q-md':      ['1.0625rem', { lineHeight: '1.25', letterSpacing: '-0.01em' }],// 17px
        'q-lg':      ['1.25rem',   { lineHeight: '1.25', letterSpacing: '-0.01em' }],// 20px
        'q-xl':      ['1.5rem',    { lineHeight: '1.08', letterSpacing: '-0.02em' }],// 24px
        'q-2xl':     ['1.875rem',  { lineHeight: '1.08', letterSpacing: '-0.02em' }],// 30px
        'q-3xl':     ['2.5rem',    { lineHeight: '1.08', letterSpacing: '-0.025em' }],// 40px
        'q-4xl':     ['3.5rem',    { lineHeight: '1.08', letterSpacing: '-0.025em' }],// 56px
        'q-display': ['4.5rem',    { lineHeight: '1.08', letterSpacing: '-0.03em' }], // 72px
      },

      // ── Spacing (4pt grid, named s-*) ────────────────────────
      spacing: {
        's-1':  '4px',
        's-2':  '8px',
        's-3':  '12px',
        's-4':  '16px',
        's-5':  '20px',
        's-6':  '24px',
        's-8':  '32px',
        's-10': '40px',
        's-12': '48px',
        's-16': '64px',
        's-20': '80px',
        's-24': '96px',
      },

      // ── Radius scale ─────────────────────────────────────────
      borderRadius: {
        // shadcn compat (keep)
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Design system r-* scale
        'r-1':   'var(--r-1)',   // 4px  (sharp edges)
        'r-2':   'var(--r-2)',   // 6px  (inputs)
        'r-3':   'var(--r-3)',   // 10px (cards, modals)
        'r-4':   'var(--r-4)',   // 14px (large cards)
        'r-5':   'var(--r-5)',   // 20px (floating panels)
        'r-pill':'var(--r-pill)',// 999px (badges, toggles)
      },

      // ── Colors (shadcn HSL vars — approximate emerald-dark theme) ─
      colors: {
        border:     "hsl(var(--border))",
        input:      "hsl(var(--input))",
        ring:       "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT:    "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT:    "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT:    "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT:    "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT:    "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT:    "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT:    "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        chart: {
          positive: "hsl(var(--chart-positive))",
          negative: "hsl(var(--chart-negative))",
        },
        sidebar: {
          DEFAULT:             "hsl(var(--sidebar-background))",
          foreground:          "hsl(var(--sidebar-foreground))",
          primary:             "hsl(var(--sidebar-primary))",
          "primary-foreground":"hsl(var(--sidebar-primary-foreground))",
          accent:              "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border:              "hsl(var(--sidebar-border))",
          ring:                "hsl(var(--sidebar-ring))",
        },
      },

      // ── Motion: durations ────────────────────────────────────
      transitionDuration: {
        'instant': '80ms',
        'fast':    '160ms',
        'base':    '240ms',
        'slow':    '420ms',
        'slower':  '720ms',
      },

      // ── Motion: easing curves ────────────────────────────────
      transitionTimingFunction: {
        'q-out':    'cubic-bezier(0.22, 1, 0.36, 1)',
        'q-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
        'q-spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'q-soft':   'cubic-bezier(0.4, 0, 0.2, 1)',
      },

      // ── Keyframes ────────────────────────────────────────────
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to:   { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to:   { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        // Design system animations
        "q-shimmer": {
          "0%":   { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "q-screen-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "q-stagger-in": {
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "q-fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        "q-modal-in": {
          from: { opacity: "0", transform: "translateY(16px) scale(0.98)" },
          to:   { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "q-bar-grow": {
          from: { transform: "scaleX(0)" },
          to:   { transform: "scaleX(1)" },
        },
        "q-path-draw": {
          from: { strokeDashoffset: "1", strokeDasharray: "1" },
          to:   { strokeDashoffset: "0", strokeDasharray: "1" },
        },
        "q-arc-in": {
          from: { opacity: "0", transform: "scale(0.94)" },
          to:   { opacity: "1", transform: "scale(1)" },
        },
        "q-tip-in": {
          from: { opacity: "0", transform: "translate(-50%, 4px)" },
          to:   { opacity: "1", transform: "translate(-50%, 0)" },
        },
      },

      // ── Animation helpers ─────────────────────────────────────
      animation: {
        "accordion-down":  "accordion-down 0.2s ease-out",
        "accordion-up":    "accordion-up 0.2s ease-out",
        "fade-in":         "fade-in 0.35s ease-out",
        "q-shimmer":       "q-shimmer 1.6s ease-in-out infinite",
        "q-screen-in":     "q-screen-in 240ms cubic-bezier(0.22, 1, 0.36, 1)",
        "q-fade-in":       "q-fade-in 240ms cubic-bezier(0.22, 1, 0.36, 1)",
        "q-modal-in":      "q-modal-in 420ms cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
