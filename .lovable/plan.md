

## Landing Page — Revised Plan

### Section Order (top to bottom)

1. **Sticky Top Nav** — Logo + links: Features, Pricing, Demo, Dashboard (if logged in). Transparent bg, blurs on scroll.

2. **Hero** — Outcome headline: "See your financial life clearly". Subtitle referencing the founder tagline. Two CTAs: "Get Started Free" → `/dashboard`, "Try Demo" → `/demo`. Animated gradient glow behind a dashboard screenshot placeholder.

3. **Benefits** — "Why people love this tool". 4 benefit cards (clarity, smarter decisions, know your future, ditch the spreadsheet chaos). Icon + short copy each.

4. **Feature Grid** — Technical capabilities: Net Worth Tracking, Allocation Analysis, Forecasting, Multi-currency. Lucide icons, concise descriptions.

5. **How It Works** — 3 numbered steps with short descriptions: Upload → Explore → Track. Horizontal on desktop, stacked on mobile.

6. **Mid-page CTA** — "Try Demo" button repeated.

7. **Privacy** — "Your data stays yours". 4 points: No bank connections, No tracking, Local-first, Export anytime.

8. **Who Is This For** — "Perfect for…" 4 persona cards: Young professionals, Investors, Spreadsheet lovers, Clarity seekers.

9. **Testimonials** — "Trusted by people who want clarity". 3 placeholder testimonial cards with avatar circles, quote, name.

10. **Founder Story** — "Built because existing tools weren't enough". 2 sentences + the tagline: "A finance cockpit for personal-finance nerds who enjoy giving themselves a well-earned pat on the back."

11. **Pricing Preview** — "Simple, transparent pricing". Two-column: Free tier vs Pro tier (forecasting, unlimited sources, exports, new measurements).

12. **Footer CTA** — "Start tracking your wealth today" + "Get Started" and "Try Demo" buttons.

13. **Footer** — Existing `<Footer />` component.

### Routing

| Route | Component | Notes |
|---|---|---|
| `/` | `LandingPage` | Marketing page |
| `/dashboard` | `Index` | Current app |
| `/pricing` | `PricingPage` | Dedicated pricing page |
| `/demo` | Redirect to `/dashboard` with `?demo=true` query param | Loads mock data |
| `/reset-password` | `ResetPassword` | Unchanged |

### Files

| Action | File | What |
|---|---|---|
| Create | `src/pages/LandingPage.tsx` | Full landing page with all sections above |
| Create | `src/pages/PricingPage.tsx` | Standalone pricing page (Free vs Pro tiers) |
| Create | `src/components/landing/StickyNav.tsx` | Shared sticky nav for landing + pricing |
| Edit | `src/App.tsx` | Add routes: `/dashboard`, `/pricing`, `/demo` redirect; change `/` to `LandingPage` |
| Edit | `src/pages/Index.tsx` | Read `?demo=true` query param to auto-load mock data |
| Edit | `src/components/dashboard/DashboardHeader.tsx` | Add logo link back to `/` |
| Edit | `index.html` | Update `<title>`, meta description, OG tags to match new marketing copy |
| Edit | `src/index.css` | Add keyframes for gradient glow animation, hover glow on CTAs |

### Design Details

- Dark theme throughout, matching existing CSS variables (primary cyan, accent green)
- Subtle section dividers using `border-b border-border/30` with spacing
- CTA buttons: `hover:scale-105 transition-transform` + subtle glow ring on hover
- Animated gradient behind hero screenshot: radial gradient with CSS animation (hue rotate)
- Testimonial cards: card bg, rounded avatar placeholder, italic quote
- Pricing cards: outlined Free vs filled/highlighted Pro with "Coming soon" badge
- All sections use semantic `<h2>` headings; hero uses `<h1>`
- Fully responsive: single column mobile, multi-column desktop grids

