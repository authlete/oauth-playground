# OAuth Playground

A client-side, developer-focused OAuth 2.1 / OIDC / FAPI 2.0 playground and
debugger — inspired by [Google's OAuth 2.0 Playground][google-pg] but built
for the modern protocol surface (PKCE, PAR, DPoP, JAR, JARM, `private_key_jwt`,
RFC 9207 issuer identification, JWT introspection of access tokens, and
more).

It lets you drive the full OAuth lifecycle against a real Authorization
Server from your browser, with every wire-level detail surfaced: the URLs,
the headers, the bodies, the tokens, the JWT contents, the network log.

The playground is primarily designed to exercise **Authlete-based
Authorization Servers** — Authlete-hosted services and the sample/demo
servers that ship with [`authlete/java-oauth-server`][java-as] and
[`authlete/typescript-oauth-server`][ts-as]. It works against any
spec-compliant AS in principle, but in practice the AS must allow
cross-origin requests from the playground's origin — see [CORS](#cors-and-which-as-you-can-target)
below.

[google-pg]: https://developers.google.com/oauthplayground/
[java-as]: https://github.com/authlete/java-oauth-server
[ts-as]: https://github.com/authlete/typescript-oauth-server

## Features

**12 steps, each a focused OAuth surface:**

| # | Step | What it does |
|---|---|---|
| 1 | Discovery | `GET /.well-known/openid-configuration` + JWKS; or paste endpoints manually |
| 2 | Client config | `none` / `client_secret_basic` / `client_secret_post` / `private_key_jwt` with JWK paste-and-validate |
| 3 | Authorization request | URL builder; scopes / response_type / response_mode; PKCE catalog; PAR / JAR / JARM toggles |
| 4 | PAR push (optional) | `POST /par` with selected client auth; `request_uri` + expiry countdown |
| 5 | Authorize → Callback | New-tab redirect to `/authorize`; captures `code` via postMessage + storage events; state / `iss` (RFC 9207) validation |
| 6 | Token exchange | `POST /token` with PKCE verifier + client auth |
| 7 | Token inspector | JWT header + payload decode; signature verify against the loaded JWKS for ES/RS/PS 256–512; expiry countdown |
| 8 | UserInfo | `GET /userinfo` with Bearer |
| 9 | Introspection (RFC 7662) | `POST /introspect` with client auth; pick which token |
| 10 | Resource call | Generic HTTP client for hitting a user-owned RS with the access token attached |
| 11 | Refresh | `grant_type=refresh_token`, optional downscope; rotated refresh detection |
| 12 | Revoke (RFC 7009) | `POST /revoke`; pick which token |

**Beyond the steps:**

- **Live request preview** — when configuring step 3, the wire-level
  request that will be sent next is shown in real time. Toggle PAR on, the
  preview swaps to the `POST /par` body. Toggle off, it shows the
  `/authorize` URL. The previews include the actual headers and body that
  will go on the wire.
- **All cryptography happens in the browser.** Web Crypto + `jose`-shape
  primitives. Tokens, private keys, JWKS, code verifiers, and the network
  log are held **in memory only** — they never touch `localStorage`,
  `sessionStorage`, or any server.
- **Share via URL** — produces a `?cfg=` link that restores the issuer,
  client config, scopes, and toggles. **Secrets are never included.**
- **Discovery → Manual override** — discovered endpoints pre-fill the
  Manual form so you can edit individual values when the AS advertises
  something wrong, or run the playground against an AS that has no
  `.well-known` endpoint at all.
- **Three-pane UI** — step list on the left, active step in the center,
  every HTTP call visible in the right-pane network log. Light and dark
  themes; brand identity flips with the theme.
- **Keyboard shortcuts** — `⌘D` toggle theme, `⌘L` clear network log, `?`
  open help.
- **No analytics, no telemetry.** The playground sees secrets; we see
  nothing.

## CORS and which AS you can target

The playground is a pure browser SPA. Every call to `/token`, `/par`,
`/introspect`, `/revoke`, `/userinfo` etc. goes directly from your browser
to the target Authorization Server. That means the AS **must send
`Access-Control-Allow-Origin`** for the playground's origin on those
endpoints.

In practice:

- **Authlete-hosted services and Authlete sample/demo Authorization
  Servers** are configured to allow CORS for the playground origin. The
  playground works against them out of the box.
- **Public consumer ASes** (Google, Auth0, Okta, ...) generally do **not**
  allow CORS on token endpoints, so step 6 (`/token`) and downstream steps
  will hit a CORS error from those.
- **Your own AS**: enable CORS for the playground origin on
  `/token`, `/par`, `/introspect`, `/revoke`, `/userinfo` and it will work.


## Architecture (one paragraph)

[Vite 6][vite] + [React 19][react] + [TypeScript][ts] + [Tailwind CSS 4][tw].
Single-page SPA. State lives in a React Context-backed reducer; step
statuses are derived from data in a single `computeStepStatuses` cascade,
so the UI never lies about progress. Cryptography is all `SubtleCrypto`.
No backend; deploy as static files anywhere.

[vite]: https://vitejs.dev/
[react]: https://react.dev/
[ts]: https://www.typescriptlang.org/
[tw]: https://tailwindcss.com/

## Build and run

Prerequisites: Node ≥ 20, npm ≥ 10.

```bash
git clone <repo-url>
cd oauth-playground

# install deps
npm install

# dev server with HMR — serves at http://localhost:5173/
npm run dev

# typecheck
npm run typecheck

# production build — outputs to dist/
npm run build

# preview the production build locally
npm run preview
```

Deploy the contents of `dist/` to any static host (S3, GitHub Pages,
Cloudflare Pages, the AS itself at `/playground/*`, etc.). No server-side
runtime is needed.

## Roadmap

Planned (in roughly priority order):

- **DPoP (RFC 9449)** across steps 6, 8, 9, 11
- **JAR (RFC 9101)** — signed authorization request objects on step 3
- **JARM (response_mode=jwt)** on step 5
- **Saved configs** — named presets in `localStorage` (no secrets)
- **Cascading staleness** — editing step N flags N+1…end as stale
- **CIBA, RAR (RFC 9396)** as the underlying AS support is added
- **Conformance-suite preset bundles**

## Project status

This is **v0.1**. Steps 1–12 are functionally complete against the design
spec. PRs and issues are welcome.

## License

Apache License 2.0 — same as
[`authlete/java-oauth-server`][java-as] and the other Authlete OSS
projects. See `LICENSE` for the full text.
