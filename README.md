# OAuth Playground

A client-side, developer-focused OAuth 2.1 / OIDC / FAPI 2.0 playground and
debugger — inspired by [Google's OAuth 2.0 Playground][google-pg] but built
for the modern protocol surface (PKCE, PAR, JAR, RAR, CIMD, `private_key_jwt`,
RFC 9207 issuer identification, Grant Management, CIBA, Device, JWT
introspection of access tokens, and more).

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

## How it's organised

The app is structured around what each thing _is_, not a flat step list. The
left rail has four zones; the center drives the selected item; the right pane
is a live network log of every HTTP call.

- **Connection** — establish who you're talking to and as whom.
  - **Discovery** — `GET /.well-known/openid-configuration` + JWKS; from an
    issuer, from a protected resource (RFC 9728 PRM), or paste endpoints by hand.
  - **Client** — identify the client. When the AS advertises **CIMD**
    (Client ID Metadata Document) the playground hosts its own metadata document
    and adopts it automatically — zero registration. Manual `client_id`,
    client secrets, `private_key_jwt`, **Dynamic Client Registration** (RFC 7591)
    and **OpenID Federation** live under "Other ways to identify the client".

- **Get a token** — pick one flow; only its steps show.
  - **Authorization Code** — Auth request (scopes, `response_type`/`response_mode`,
    PKCE, PAR, JAR, RAR/`authorization_details`, Grant Management, RFC 8707 resource
    indicator) → optional **PAR** push → **Authorize** (new-tab redirect, `code`
    captured via postMessage + storage events, `state`/`iss` validation) →
    **Token exchange**. Auto-exchange is configurable.
  - **Device** (RFC 8628) — request a user code, show it, poll `/token` while the
    user approves at the verification URL on a second device.
  - **Backchannel (CIBA)** — poll-mode backchannel authentication with `login_hint`.

- **Use the token** — a menu, any order, once you hold a token.
  - **Resource call** — a generic HTTP client that attaches the access token.
  - **UserInfo** · **Introspection** (RFC 7662) · **Grant Management**.

- **Manage** — **Refresh** (`grant_type=refresh_token`, optional downscope,
  rotated-refresh detection) · **Revoke** (RFC 7009).

- **Tools** — **Token inspector**: decode any JWT, verify the signature against
  the loaded JWKS (ES/RS/PS 256–512), expiry countdown.

### Beyond the flows

- **Live request preview** — the exact wire request that will be sent next is
  shown in real time and updates as you toggle options (PAR, JAR, …).
- **CIMD, self-hosted** — the playground serves its own Client ID Metadata
  Document at `/client-metadata.json`, so against a CIMD-capable AS you are a
  client with no registration. You can inspect the document inline.
- **All cryptography happens in the browser** (Web Crypto). Tokens, private
  keys, JWKS, code verifiers, and the network log are held **in memory only** —
  never `localStorage`, `sessionStorage`, or any server.
- **Share via URL** — a `?cfg=` link restores the issuer, client config, scopes,
  and toggles. **Secrets are never included.**
- **Consistent, collapsible sections** — each section shows its active state and
  opens or stays collapsed by what it is (essentials open, advanced/auto-generated
  collapsed).
- **Light and dark themes**, keyboard shortcuts (`⌘D` theme, `⌘L` clear log,
  `⌘J` toggle log, `?` help), and **no analytics, no telemetry**.

## CORS and which AS you can target

The playground is a pure browser SPA. Every call to `/token`, `/par`,
`/introspect`, `/revoke`, `/userinfo` etc. goes directly from your browser
to the target Authorization Server, so the AS **must send
`Access-Control-Allow-Origin`** for the playground's origin on those endpoints.

- **Authlete-hosted services and Authlete sample/demo ASes** allow CORS for the
  playground origin and work out of the box.
- **Public consumer ASes** (Google, Auth0, Okta, …) generally do not allow CORS
  on the token endpoint, so the token exchange and downstream calls hit a CORS error.
- **Your own AS** — enable CORS for the playground origin on `/token`, `/par`,
  `/introspect`, `/revoke`, `/userinfo` and it will work.

CIMD note: the AS fetches the `client_id` URL server-side (no CORS needed), but
the URL must be reachable by the AS and, per the draft, HTTPS (loopback is
allowed for local development).

## Architecture

[Vite 6][vite] + [React 19][react] + [TypeScript][ts] + [Tailwind CSS 4][tw].
Single-page SPA, no backend.

There is a deliberate seam between the protocol and the UI:

- **`src/protocol/`** — the UI-agnostic core: pure wire logic (build requests,
  parse responses, crypto, CIMD) plus the conformance harness. It never imports
  React or any UI code, so it runs identically in the browser and in Node tests.
- **`src/` (React)** — the UI head. State lives in a Context-backed reducer
  (`src/store/playground.tsx`); step statuses derive from data in a single
  `computeStepStatuses` cascade, so the rail never lies about progress.

### Conformance harness

The client-side MUSTs the playground implements are tracked as spec-traced
requirements and proven by tests:

- `src/protocol/conformance/requirements.ts` — one entry per requirement (id,
  spec, section, text), the index the tests are measured against.
- `test/conformance/*` — each test is named by the requirement id it proves. A
  meta-test refuses a requirement with no test, or a test naming an unknown id.
- `npm run mutants` — breaks each rule on purpose and asserts the matching test
  fails, so the tests can't be vacuous.

Adding a capability means adding its requirement, a test, and a mutant (see
`src/protocol/README.md`).

[vite]: https://vitejs.dev/
[react]: https://react.dev/
[ts]: https://www.typescriptlang.org/
[tw]: https://tailwindcss.com/

## Build and run

Prerequisites: Node ≥ 20, npm ≥ 10.

```bash
npm install

# dev server with HMR — http://localhost:5173/
npm run dev

# type-check + run the conformance tests (the real gate)
npm run verify

# conformance tests only / mutation testing / lint
npm run test
npm run mutants
npm run lint

# production build — outputs to dist/
npm run build
```

> `npm run typecheck` (`tsc --noEmit`) is a no-op against the solution-style
> root tsconfig — use **`npm run verify`** (or `npm run build`) to type-check.

Deploy `dist/` to any static host. The build also emits a static
`dist/client-metadata.json` for CIMD; set **`VITE_PUBLIC_ORIGIN`** to the deploy
origin (e.g. `https://oauth-playground.example`) so the document's `client_id`
and `redirect_uris` match the URL it's served from. Without it, the file falls
back to `http://localhost:5173`.

## Roadmap

- **DPoP (RFC 9449)** — sender-constrained tokens across PAR / token / userinfo /
  resource (configured once, applied everywhere it's relevant).
- **JARM** (`response_mode=jwt`) — signed authorization responses.
- **Saved configs** — named presets in `localStorage` (no secrets).
- **Cascading staleness** — editing an earlier step flags later ones as stale.

## License

Apache License 2.0 — same as [`authlete/java-oauth-server`][java-as] and the
other Authlete OSS projects. See `LICENSE` for the full text.
