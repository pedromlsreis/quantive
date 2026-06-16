# Security Policy

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, disclose privately:

- **Email:** legal@usequantive.app. Include a description, steps to reproduce, and impact.
- **GitHub private advisory:** open one at <https://github.com/pedromlsreis/quantive/security/advisories/new>.

We aim to acknowledge reports within 48 hours and will keep you informed as we address the issue.

## Scope

In scope: authentication, encryption, key management, data isolation, and any vector that could expose user data.

Out of scope: issues already documented in [`/security`](https://usequantive.app/security) under "What we do not protect against" (compromised device, malicious server JS, metadata).

## Design & Threat Model

The full encryption design, threat model, and known limitations are documented in [`docs/security/encryption.md`](docs/security/encryption.md) and on the [Security page](https://usequantive.app/security).
