# `src/protocol` — the protocol core (the seam)

This folder is the UI-agnostic half of the app: the OAuth 2.1 / OIDC / FAPI
protocol logic, plus the conformance harness that proves it.

**The one rule:** `protocol/` must never import from `src/ui`, `src/components`,
`src/steps`, or `src/store`, and must not import `react`. It is pure wire logic
(build requests, parse responses, crypto) that runs the same in a browser and
in a Node test. The React app is one _consumer_ of this core.

Why it exists: the UI will keep evolving. Keeping protocol behaviour here, behind
a boundary and locked by tests, means a UI refactor cannot change what goes on
the wire. Correctness lives here; presentation lives in `src/*` React code.

- `*.ts` — one capability per file (`pkce`, `authorizeUrl`, `tokenExchange`,
  `par`, `cimd`, `clientAuth`, `jwt`, …).
- `conformance/` — `requirements.ts` is the index of client-side MUSTs we
  implement, each traced to a spec and proven by a test in `test/conformance/`
  named with its id. The meta-test refuses a requirement with no test, or a test
  naming an unknown id. `npm run mutants` breaks each rule to prove the tests
  aren't vacuous.

## Adding a capability (the harness stays current by construction)

1. Add its MUSTs to `conformance/requirements.ts` (id, spec, section, text) and
   bump `EXPECTED_REQUIREMENT_COUNT`.
2. Add a test in `test/conformance/` whose name begins with each id.
3. Add a mutant in `scripts/mutants.mjs` that breaks the rule.
4. Run `npm run verify` (types + tests) and `npm run mutants`.

The meta-test fails if a requirement has no test or the count drifts, so a
capability can't land unproven. `npm run verify` is the real type+test gate
(`npm run typecheck` is a no-op against the solution tsconfig).
