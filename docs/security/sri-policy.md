# Subresource Integrity (SRI) policy

**Last reviewed:** 2026-10-01.
**Scope:** the third-party JavaScript surface of the Quantive web app.
**Decision:** SRI is not applied to any of the third-party origins in the
`script-src` allowlist. This document explains why, what the residual risk is,
and what we do instead.

---

## What SRI is, and what it would buy us

The `integrity="sha384-..."` attribute on a `<script>` tag tells the browser to
refuse the response if its bytes do not hash to the pinned digest. It is the
strongest defence against a third-party origin serving altered JavaScript: a
network-level attacker, a compromised CDN edge, or a malicious vendor cannot
ship code to our users unless they also collide a SHA-384.

SRI is appropriate when (a) we load a `<script src="...">` from a third-party
origin, and (b) the third party publishes per-version URLs with a stability
guarantee. When either condition is absent, SRI either does nothing useful or
causes outages.

---

## The third-party JS surface

`script-src` in `public/_headers` allows `'self'`, `'wasm-unsafe-eval'` and three
third-party origins (five hosts):

1. Stripe: `https://js.stripe.com`
2. Cloudflare Turnstile: `https://challenges.cloudflare.com`
3. PostHog: `https://eu.i.posthog.com` and `https://eu-assets.i.posthog.com`

### Stripe

We do not load `js.stripe.com/v3/` at all. `@stripe/stripe-js` is not a
dependency, and nothing in `src/` calls `loadStripe`. The billing flow is:

1. The browser calls our `create-checkout` Supabase Edge Function.
2. The function creates a Stripe Checkout Session server-side and returns the
   hosted-checkout URL.
3. The browser navigates via `window.location.href = data.url` to
   `https://checkout.stripe.com/...`.

The customer portal (`customer-portal` edge function) uses the same redirect.
At no point does the app execute code served from `js.stripe.com`. The CSP
entry is inert; it is kept so that adding Stripe Elements later does not need a
CSP change.

**Conclusion for Stripe.** There is no script to apply SRI to. Not running any
Stripe-controlled code in our document is strictly stronger than SRI.

If we ever embed Stripe Elements: `js.stripe.com/v3/` is a rolling URL whose
bytes change without a version bump, so Stripe security fixes reach sites
without a deploy. Stripe publishes no per-version, SRI-friendly URLs for
Stripe.js, so a pinned hash would cause an outage on the next rotation.

### Cloudflare Turnstile

Turnstile is the CAPTCHA on sign-up, sign-in, password reset, resending the
confirmation email, and the landing page's email sign-up form. `src/components/auth/Turnstile.tsx` injects
`https://challenges.cloudflare.com/turnstile/v0/api.js` the first time one of
those forms renders. The script runs in our document and stays loaded for the
rest of the page's life, which includes the unlock screen and the decrypted
dashboard if the user signs in without a full reload. The challenge itself
renders in a cross-origin iframe, but the loader does not.

Turnstile is not behind the analytics consent gate. It is a security control on
the auth endpoints, and Supabase rejects password sign-in without a valid token.

SRI does not fit here either:

- **`api.js` is a rolling URL.** `v0` is a major-version path, not a content
  pin. Cloudflare updates the file in place and does not publish integrity
  hashes for it.
- **Cloudflare does not support serving it from anywhere else.** Its
  documentation requires loading `api.js` from `challenges.cloudflare.com`, so
  self-hosting a pinned copy is not an option.

**Conclusion for Turnstile.** SRI is not available. This is the most exposed of
the three origins, because it runs for every user who signs in and it is
present in the document while the password is typed. Its residual is described
below.

### PostHog

PostHog is the `posthog-js` npm package. Its core code ships *inside* our Vite
bundle, which is emitted with hashed filenames under `/assets/` and served
`immutable` (see `_headers`). The URL of every `/assets/*.js` we serve is itself
a content hash: an attacker who replaces the bytes also has to change the
filename, which requires a deploy by us. That gives the bundled core the same
property SRI would.

At runtime, after `posthog.init()`, the SDK can inject `<script>` tags pointing
at `https://eu-assets.i.posthog.com/static/<extension>.js?v=<sdk-version>` for
extension bundles (`exception-autocapture`, `surveys`, `recorder`, `toolbar`,
`web-vitals` and others). The loader lives at
`node_modules/posthog-js/dist/external-scripts-loader.js`:

```js
i.__PosthogExtensions__.loadExternalDependency = (r, e, n) => {
  // ...
  var a = "/static/" + e + ".js?v=" + r.version;
  // ...
  i = r.requestRouter.endpointFor("assets", a);
  t(r, i, n);
};
```

This is where SRI could in principle apply. We do not apply it because:

- **PostHog publishes no SRI hashes.** There is no public list of `sha384-...`
  digests per extension per SDK version. We would have to fetch every extension
  we load, hash it at build time, embed the digest, and repeat on every
  `posthog-js` upgrade.
- **The URL is cache-busted by SDK version, not content-pinned.** PostHog can
  ship a fix to `exception-autocapture.js?v=<version>` without changing the
  version string. A pinned hash would then silently break error reporting.
- **Our configuration keeps the surface small.** `src/lib/analytics.ts` sets
  `autocapture: false`, `capture_pageview: false`, `capture_pageleave: false`,
  `disable_session_recording: true` and `persistence: 'localStorage'`. In
  practice the extension that gets fetched is `exception-autocapture`, the
  first time `posthog.captureException` is called.
- **`prepare_external_dependency_script` is a seam, not a source of hashes.**
  It is where SRI would be injected if we built a fetch-and-hash pipeline, but
  it does not solve the lack of published hashes or URL stability.

**Conclusion for PostHog.** The bundled core is protected by hashed, immutable
filenames. The runtime-fetched extensions are not, and SRI cannot be added to
them without a pipeline that pins hashes against an upstream that does not
commit to URL stability.

---

## What we accept and what we mitigate

### The residual

Any script that runs in our document has the same power as our own code. It
can read what the user types into the password field, call the same functions
the app calls, and read decrypted data rendered on the page. End-to-end
encryption does not protect against code running inside the page, so a
compromised third-party origin is equivalent to the "actively malicious server"
case in [encryption.md §16](./encryption.md#16-the-actively-malicious-server-caveat-read-this).

Concretely:

- **Turnstile.** Someone controlling what `challenges.cloudflare.com` serves
  could run code in the sign-in document of every user who signs in. This
  residual applies to all users, with or without analytics consent.
- **PostHog.** Someone controlling what `eu-assets.i.posthog.com` serves could
  run code in the documents of users who granted analytics consent, once an
  extension is fetched.
- **Stripe.** No residual today, because Stripe.js is not loaded.

We accept the Turnstile and PostHog residuals. Both vendors run large, audited
infrastructure, both origins are served over HTTPS, and the alternatives are
worse: no bot protection on the auth endpoints, or no production error
reporting.

### The controls in place

- **CSP `script-src` is a tight allowlist.** Only `'self'`,
  `'wasm-unsafe-eval'` and the five hosts above. No `'unsafe-inline'`, no
  `'unsafe-eval'`, no `https:`. A compromised host outside that list cannot run
  script in our origin.
- **HSTS with `preload`** prevents downgrading our own origin to HTTP.
- **Hashed filenames and `immutable` caching on `/assets/*`** give all
  first-party code and PostHog's bundled core the property SRI would give: the
  bytes cannot change without a new filename.
- **PostHog runs only after explicit consent** (`getConsent() === 'granted'`).
  Users who decline never load the SDK and never fetch from
  `eu-assets.i.posthog.com`.
- **Turnstile loads only when a form needs it.** The auth modal loads it; the
  landing page's email form loads it only once the email field is focused. A
  user who opens the app with a remembered session and unlocks without opening
  either form does not load it in that page session.

### The lever we have not pulled

`posthog-js` supports `disable_external_dependency_loading: true`, which stops
the SDK from injecting any runtime-fetched extension. In our configuration, the
only extension we use is `exception-autocapture`, which is what makes
`posthog.captureException(error)` send an event (the method returns early when
`this.exceptions` is unset; see `posthog-core.js`).

Setting the flag closes the PostHog runtime-script surface entirely, at the cost
of stack-trace-enriched error reports from production. Custom
`posthog.capture('error_occurred', {...})` calls would still work, because the
core capture path is bundled.

We have not set it. The trade-off favours visibility into production errors
over closing a surface that is limited to consenting users.

Turnstile has no equivalent lever short of removing the CAPTCHA.

---

## What would change this decision

We will revisit this policy if any of the following happens:

- PostHog publishes per-version SRI hashes for its extension bundles, with a
  stability guarantee per URL.
- Cloudflare publishes a versioned, content-stable URL for Turnstile's
  `api.js`, or supports self-hosting it.
- Stripe publishes a versioned, content-stable URL for Stripe.js.
- We adopt Stripe Elements, i.e. start loading Stripe.js into our document.
- A supply-chain incident at any of the three vendors. For PostHog the fast
  response is `disable_external_dependency_loading: true`; for Turnstile it is
  moving the CAPTCHA to a different provider or a server-side check.

This document is the canonical reference for the SRI question. Anything the
Quantive site says about SRI should match it.
