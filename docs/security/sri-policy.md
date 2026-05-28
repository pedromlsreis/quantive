# Subresource Integrity (SRI) policy

**Status:** decided, 2026-05-28. Reviewed before the HN launch on 2026-06-23.
**Scope:** the third-party JavaScript surface of the Quantive web app.
**Decision:** SRI is not applied to either of the third-party origins listed in
the `script-src` allowlist. This document explains why, and what we do instead.

---

## What SRI is, and what it would buy us

The `integrity="sha384-..."` attribute on a `<script>` tag tells the browser to
refuse the response if its bytes do not hash to the pinned digest. It is the
strongest defence against a CDN serving altered JavaScript: a network-level
attacker, a compromised CDN edge, or a malicious vendor cannot ship code to our
users unless they also collide a SHA-384.

SRI is appropriate when (a) we directly include a `<script src="...">` to a
third-party origin in our HTML, and (b) the third party publishes per-version
URLs with a stability guarantee. When either condition is absent, SRI either
does nothing useful or causes outages.

---

## The third-party JS surface as of 2026-05-28

Two origins are allowlisted in `public/_headers` under `script-src`:

1. `https://js.stripe.com`
2. `https://eu.i.posthog.com` and `https://eu-assets.i.posthog.com`

### Stripe

We do not load `js.stripe.com/v3/` from our HTML at all. The package
`@stripe/stripe-js` is not a dependency, and a repo-wide search for `loadStripe`
returns zero matches in `src/`. The billing flow is:

1. The browser calls our `create-checkout` Supabase Edge Function.
2. The function creates a Stripe Checkout Session server-side and returns the
   hosted-checkout URL.
3. The browser navigates via `window.location.href = data.url` to
   `https://checkout.stripe.com/...`.

The same redirect pattern is used for the customer portal (`customer-portal`
edge function). At no point does our SPA execute code served from
`js.stripe.com`. The CSP entry is currently inert; it is kept so that adding
Stripe Elements later does not require a CSP edit and a fresh deploy.

**Conclusion for Stripe.** There is no script to apply SRI to. The relevant
mitigation is "we do not embed Stripe.js" — strictly stronger than SRI, because
we do not run any Stripe-controlled code in the document at all.

If we ever embed Stripe Elements, Stripe's published guidance is that
`js.stripe.com/v3/` is a rolling URL whose bytes change without a version bump,
which Stripe positions as a feature (security fixes propagate without site
deploys) and which makes SRI on that URL operationally hostile. Stripe does not
publish per-version SRI-friendly URLs for Stripe.js. Pinning a hash would
guarantee a future outage on the next silent rotation. At the point we adopt
Elements, the choice will be to accept the rolling-URL trade-off (which the
rest of the industry, including PCI-conscious sites, also accepts) and rely on
the CSP allowlist plus Stripe's own subdomain hardening.

### PostHog

PostHog is loaded as the `posthog-js` npm package. Its core code ships *inside*
our Vite bundle, which is emitted with hashed filenames under `/assets/` and
served `immutable` (see `_headers`). The URL of every `/assets/*.js` we serve
is itself a content hash; an attacker who replaces the bytes also has to
collide the filename, which is the same security property SRI provides. The
core PostHog code is therefore protected by Vite's hashing, not by SRI.

At runtime, after `posthog.init()`, the SDK can dynamically inject `<script>`
tags pointing at `https://eu-assets.i.posthog.com/static/<extension>.js?v=<sdk-version>`
for extension bundles: `exception-autocapture`, `surveys`, `recorder`,
`toolbar`, `web-vitals`, and so on. The loader lives at
`node_modules/posthog-js/dist/external-scripts-loader.js` and the relevant code
path is:

```js
i.__PosthogExtensions__.loadExternalDependency = (r, e, n) => {
  // ...
  var a = "/static/" + e + ".js?v=" + r.version;
  // ...
  i = r.requestRouter.endpointFor("assets", a);
  t(r, i, n);
};
```

This is the surface where SRI would, in principle, apply. The reasons we do not
apply it:

- **PostHog publishes no SRI hashes.** There is no public list of
  `sha384-...` digests per extension per SDK version. We would have to fetch
  every extension we load, hash it at build time, embed the digest, and re-run
  the pipeline whenever we bump `posthog-js`.
- **The URL is cache-busted by SDK version, not content-pinned.** PostHog
  reserves the right to ship a fix to `exception-autocapture.js?v=1.373.4`
  without changing the version string. A pinned hash would silently break
  error reporting on that rotation.
- **Our configuration already minimises the surface.** In `src/lib/analytics.ts`
  we set `autocapture: false`, `capture_pageview: false`,
  `capture_pageleave: false`, `disable_session_recording: true`,
  `persistence: 'localStorage'`. With these flags, the extensions that get
  fetched in practice are limited (notably `exception-autocapture`, fetched
  the first time `posthog.captureException` is called).
- **PostHog provides `prepare_external_dependency_script` as a hook, but no
  authoritative source for the integrity values it would set.** That hook is
  the right place to inject SRI if we ever build the fetch-and-hash pipeline,
  but it does not solve the underlying "no published hashes, no stability
  guarantee" problem; it only provides the seam.

**Conclusion for PostHog.** The bundled core code is protected by Vite's
hashed-filename immutability. The dynamically-fetched extensions are not, and
SRI cannot be retrofitted onto them without a build-time pipeline that pins
hashes we would have to maintain ourselves against an upstream that does not
commit to URL stability.

---

## What we accept and what we mitigate

### The residual

A successful attacker controlling either `eu.i.posthog.com` or
`eu-assets.i.posthog.com` could serve modified JavaScript to consenting users
on the next page load. The window is bounded by the user's consent (PostHog is
off until consent is granted) and by PostHog's own infrastructure security; an
attacker who also has TLS interception for `*.i.posthog.com` would need to
defeat HSTS and HPKP-equivalent controls in addition.

We do not accept the same residual for Stripe today, because we do not load
Stripe.js. We will re-evaluate at the point we adopt Stripe Elements.

### The controls in place

- **CSP `script-src` is a tight allowlist.** Only `'self'`, `'wasm-unsafe-eval'`,
  `js.stripe.com`, and the two PostHog hosts are permitted. No `'unsafe-inline'`,
  no `'unsafe-eval'`, no `https:`. An attacker who compromises a host outside
  that list still cannot execute script in our origin.
- **`'unsafe-inline'` is deliberately absent.** All script is either a hashed
  asset under `/assets/*.js` or one of the four allowlisted hosts.
- **HSTS with `preload`** is set on the response; users with a preloaded record
  cannot be downgraded to HTTP at the network layer.
- **Vite hashed filenames + `immutable` `Cache-Control` on `/assets/*`** give
  the bundled portion of PostHog (and all our own first-party code) the same
  guarantee SRI would give: a name change is required to change the bytes.
- **PostHog runs only after explicit consent** (`getConsent() === 'granted'`).
  Users who decline never load the SDK and never trigger any
  `eu-assets.i.posthog.com` fetch.
- **The Data Key never touches the SDK.** PostHog cannot exfiltrate the
  encryption key because the key is not exposed outside `src/lib/crypto/`;
  even if a malicious extension bundle were loaded, it would not find a Data
  Key in any global, `localStorage`, `sessionStorage`, IndexedDB, or
  `postMessage` channel.

### The lever we have not pulled

`posthog-js` supports `disable_external_dependency_loading: true`. Setting
this flag causes the SDK to refuse to inject any of the runtime-fetched
extension scripts. The cost is losing the features those extensions provide:
in our configuration, the only one we actually use is `exception-autocapture`,
which is what makes `posthog.captureException(error)` actually send the event
(the method early-returns when `this.exceptions` is unset, see
`posthog-core.js`).

If the residual described above ever stops looking acceptable — for example,
after a meaningful PostHog supply-chain incident — pulling this lever closes
the runtime-script surface entirely, at the cost of stack-trace-enriched error
reporting from production. Custom `posthog.capture('error_occurred', {...})`
calls would still work, because the core capture path is bundled, not
dynamically loaded.

We have not pulled this lever today. The trade-off favours visibility into
production errors during the launch window over closing a surface whose
realised-attack probability is low and whose blast radius is bounded by the
consent gate.

---

## What would change this decision

We will revisit this policy if any of the following happens:

- PostHog publishes per-version SRI hashes for its extension bundles, with a
  documented stability guarantee per URL.
- Stripe publishes a versioned, content-stable URL for Stripe.js (e.g.
  `js.stripe.com/v3.x.y/`) with an integrity attribute we can pin.
- We adopt Stripe Elements (i.e. start loading Stripe.js into our document).
  At that point we re-run the trade-off with the realistic option of accepting
  the rolling-URL convention or moving to a self-hosted proxy.
- A meaningful supply-chain incident materially raises the assumed probability
  on either origin. Pulling `disable_external_dependency_loading: true` is the
  fast lever; building a fetch-and-hash pipeline is the slower one.

This document is the canonical reference for the SRI question. If outbound
copy says anything about SRI on the Quantive site, it should reflect what is
written here, not "SRI is on the roadmap."
