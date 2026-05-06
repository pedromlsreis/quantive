# Hacker News launch

Status: **draft**

---

## TL;DR

- Personal net-worth tracker where the server stores only ciphertext — your portfolio data never leaves your browser unencrypted.
- Keys are derived from your password with Argon2id and never sent to the server; a full database leak reveals nothing.
- XChaCha20-Poly1305 AEAD with per-encryption random nonces and AAD binding that ties each ciphertext to your user ID (prevents cross-user transplant attacks).
- Optional 24-word BIP-39 recovery code wraps the same Data Key under a separate KEK so you're not locked out if you forget your password — but if you skip it and forget your password, your data is gone by design.
- Crypto module is open source, pure (no I/O), and tested against the IETF draft KAT vector for XChaCha20-Poly1305 and at-production Argon2id parameters.

---

## Title

**Show HN: A personal finance app where the server can't read your data**

---

## Body (post text)

> Hi HN — I've been building a personal net-worth tracker that's end-to-end encrypted in the browser. The pitch: your portfolio data is encrypted with a key derived from your password before it ever touches my server. The server stores only ciphertext: no keys, no plaintext. A full database leak reveals nothing about your finances.
>
> I wanted a finance app that didn't require handing over bank credentials or trusting a third party with my entire financial life. Nothing I found matched that threat model, so I built one.
>
> Specifics:
>
> - **AEAD:** XChaCha20-Poly1305 (192-bit nonce, so random nonces are safe at any scale).
> - **KDF:** Argon2id, `t=3, m=64 MiB, p=1`. One Argon2id derivation per login.
> - **Library:** libsodium (libsodium-wrappers-sumo).
> - **Key hierarchy:** password → KEK → wrapped Data Key → snapshot ciphertext. Password change rotates the wrap, not the DK, so the rotation is O(1) regardless of how much data you have.
> - **AAD framing** binds each ciphertext to your user ID, so even with full database write access, an attacker can't move one user's data into another user's account without it failing to decrypt.
> - **Recovery code** is a BIP-39 24-word mnemonic that wraps the same DK under a separate KEK. Optional. If you skip it and forget your password, your data is gone — I can't recover it for you, by design.
>
> What I am explicitly **not** defending against, and the post is up-front about it: an actively malicious server (the JS-delivery problem that all web E2E shares — Bitwarden, ProtonMail, Standard Notes), compromised devices, metadata, and forgotten passwords without a recovery code. The honest non-goals are the part I'd most like critique on.
>
> The full design doc — primitive choices, threat model, key hierarchy, schema, AAD framing, migration plan, what's tested vs. not — is in the repo. The crypto module is small, pure (no I/O), and tested for round-trip, tamper detection, AAD binding (including the cross-user isolation property), and a fuzz-style negative test that asserts random ciphertexts can never decrypt successfully. Tests run real Argon2id at production parameters.
>
> - Live: https://usequantive.app
> - Repo: https://github.com/pedromlsreis/quantive
> - Design doc: https://github.com/pedromlsreis/quantive/blob/main/docs/security/encryption.md
> - Public security page: https://usequantive.app/security
>
> Solo project, no tracking, no analytics, free to use, no paid tier yet. Genuinely interested in feedback on the design — particularly on anything I've gotten subtly wrong, anything I've over-claimed, and the open items in the "future work" section (PAKE-based auth being the obvious one).

---

## Notes for posting

### Pre-flight checklist (do these BEFORE submitting)

- [ ] **Repo is public.** Confirm `gh repo view --json visibility` returns `PUBLIC`.
- [x] **`.env` is removed from git AND history is scrubbed.** `git log --all -- .env` should be empty. Use `git filter-repo` if needed. Rotate Supabase anon key after.
- [x] **All Supabase keys rotated** since the codebase has been reviewed externally.
- [x] **README pinned at top of repo** has a one-paragraph encryption summary linking to `docs/security/encryption.md`. HN visitors land on the README; surface the story there.
- [ ] **One canonical HN-friendly screenshot** in the README — recovery code modal, settings security panel, or threat-model excerpt. Not a marketing hero.
- [ ] **Open issues triaged.** Anything embarrassing on the issue tracker should either be fixed, hidden, or have a clear acknowledgment in the OP.
- [ ] **Status page / contact.** Have a way for security reports to reach you (link in `/security` page).

### Posting tactics

- **Time of day:** Tuesday–Thursday, 06:00–09:00 PT (around US east-coast morning). Avoid weekends.
- **Don't ask for upvotes.** It gets the post killed. Don't tell anyone you posted.
- **Stay in the comments for the first 4 hours.** Engagement with substantive comments matters more than the post itself for ranking.
- **Reply to crypto critique on the merits.** If someone points out a real issue, acknowledge fast and either fix or open an issue. Don't litigate.
- **Don't use the word "blockchain", "AI", "revolutionary", or "ultimate".** Tonally wrong for this audience.

### Predicted critiques to prepare answers for

- **"Web-based E2E is fundamentally broken."** Acknowledge — it is, against an active server. The doc says so. Defense is reduced trust surface (no plaintext at rest), not absolute security. Native client is on the roadmap.
- **"Why not OPAQUE/SRP-6a?"** PAKE would remove the residual "Supabase auth sees the password" caveat. It's the right next step but requires replacing Supabase auth — non-trivial for a solo project. In the future-work section.
- **"Just use a password manager + a Google Sheet."** Fair. The product's value is in the analytics layer (allocation breakdowns, forecasting, milestones) on top of the data, not in the storage itself.
- **"Has this been audited?"** No. Argued in the doc — audit is on the roadmap, funded post-revenue. Until then: open source, design doc, and a focused crypto module that's small enough to read.
- **"Why XChaCha20-Poly1305 over AES-GCM?"** Random-nonce safety. AES-GCM's 96-bit nonce makes random nonces marginal at scale (birthday bound ~2^32 messages). XChaCha20-Poly1305's 192-bit nonce removes the question.
- **"Why Argon2id parameters t=3, m=64MiB and not stronger?"** Mobile-browser feasibility. Stronger settings OOM on mid-range Android. The `enc_version` mechanism allows future bumps without breaking decrypt.
- **"What about metadata?"** Acknowledged in non-goals. The server sees account existence, email, timestamps, and rough payload sizes. Hiding metadata is a much harder problem (PIR, anonymity sets) and not the project's scope.

### What NOT to include in the post itself

- Don't lead with the product. Lead with the engineering. HN reads marketing fluff and bounces.
- Don't include pricing.
- Don't include a list of "features" that aren't differentiated by the encryption story.
- Don't oversell: avoid "unbreakable", "world-class", "best-in-class". The audience hates this, and the limitations section in the doc will be quoted back at you if you do.

### After posting

- If the post hits the front page, expect a traffic spike. Make sure the Supabase project is on a tier that handles it. Free tier rate limits will become visible.
- If a real security issue surfaces in comments, prioritize fixing it over engagement. A public "fixed in commit X" reply to the original comment within 24h is the strongest credibility signal possible.
- Save the comment thread to a file. The critique is the most valuable artifact of a launch.
