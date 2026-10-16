// Mutation testing: break one rule in the source, prove the named test turns
// red. A surviving mutant means the test passes for the wrong reason. Run with
// `npm run mutants`. Requires a clean working tree for the mutated files.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Each mutant breaks exactly one requirement; its test (matched by id) must
// then fail. `find` must occur exactly once in the file.
const MUTANTS = [
  {
    req: "pkce.challenge",
    file: "src/protocol/pkce.ts",
    find: '"SHA-256"',
    replace: '"SHA-1"',
  },
  {
    req: "pkce.authorize-param",
    file: "src/protocol/authorizeUrl.ts",
    find: '"S256"',
    replace: '"plain"',
  },
  {
    req: "state.compared",
    file: "src/protocol/authorizeFlow.ts",
    find: "params.state === expectedState",
    replace: "true",
  },
  {
    req: "clientauth.secret-basic",
    file: "src/protocol/clientAuth.ts",
    find: "`Basic ${encoded}`",
    replace: "`Bearer ${encoded}`",
  },
  {
    req: "cimd.client-id-matches",
    file: "src/protocol/cimd.ts",
    find: "client_id: clientMetadataUrl(o),",
    replace: "client_id: o,",
  },
  {
    req: "refresh.grant",
    file: "src/protocol/refresh.ts",
    find: 'body.set("grant_type", "refresh_token")',
    replace: 'body.set("grant_type", "authorization_code")',
  },
  {
    req: "userinfo.bearer",
    file: "src/protocol/userInfo.ts",
    find: "`Bearer ${input.accessToken}`",
    replace: "`Token ${input.accessToken}`",
  },
  {
    req: "device.client-id",
    file: "src/protocol/deviceAuth.ts",
    find: 'body.set("client_id", input.client.clientId);',
    replace: "",
  },
  {
    req: "dpop.proof-typ",
    file: "src/protocol/dpop.ts",
    find: 'typ: "dpop+jwt"',
    replace: 'typ: "jwt"',
  },
  {
    req: "dpop.proof-claims",
    file: "src/protocol/dpop.ts",
    find: "htm: input.htm,",
    replace: "htm: undefined,",
  },
  {
    req: "dpop.htu-canonical",
    file: "src/protocol/dpop.ts",
    find: "return `${u.origin}${u.pathname}`;",
    replace: "return url;",
  },
  {
    req: "dpop.thumbprint",
    file: "src/protocol/dpop.ts",
    find: "{ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }",
    replace: "{ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }",
  },
  {
    req: "dpop.token-header",
    file: "src/protocol/dpop.ts",
    find: '"DPoP",',
    replace: '"DPoPx",',
  },
  {
    req: "dpop.resource-ath",
    file: "src/protocol/dpop.ts",
    find: "`DPoP ${req.accessToken}`",
    replace: "`Bearer ${req.accessToken}`",
  },
  {
    req: "dpop.nonce-retry",
    file: "src/protocol/dpopHttp.ts",
    find: "if (challenged) result = await attempt(nonce);",
    replace: "",
  },
];

// Each mutant's original content is captured in memory and restored in a
// `finally`, so a normal run never leaves a file mutated. (We don't gate on a
// clean git tree because this branch is intentionally uncommitted.)

/** Run the one test for a requirement id; return true if it PASSED. */
function testPasses(req) {
  try {
    execFileSync("npx", ["vitest", "run", "-t", req], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

const survivors = [];
for (const m of MUTANTS) {
  const path = join(root, m.file);
  const original = readFileSync(path, "utf8");
  const occurrences = original.split(m.find).length - 1;
  if (occurrences !== 1) {
    console.error(
      `✗ ${m.req}: '${m.find}' occurs ${occurrences}× in ${m.file} (need exactly 1)`,
    );
    survivors.push(m.req);
    continue;
  }
  writeFileSync(path, original.replace(m.find, m.replace));
  try {
    const passed = testPasses(m.req);
    if (passed) {
      survivors.push(m.req);
      console.error(
        `✗ SURVIVED  ${m.req} — test still passed with the rule broken`,
      );
    } else {
      console.log(`✓ caught    ${m.req}`);
    }
  } finally {
    writeFileSync(path, original);
  }
}

if (survivors.length) {
  console.error(
    `\n${survivors.length} mutant(s) survived: ${survivors.join(", ")}`,
  );
  process.exit(1);
}
console.log(
  `\nAll ${MUTANTS.length} mutants caught — the tests are not vacuous.`,
);
