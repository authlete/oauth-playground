// The anti-rot lock: you cannot drop a requirement, add one without a test, or
// name a requirement id that doesn't exist. Reads the sibling test files as
// text and checks their test titles against the requirement index.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  EXPECTED_REQUIREMENT_COUNT,
  REQUIREMENTS,
} from "../../src/protocol/conformance/requirements";

const here = dirname(fileURLToPath(import.meta.url));

// Every id that appears as the leading token of a test title: `test("<id>: …`.
function referencedIds(): Set<string> {
  const ids = new Set<string>();
  for (const file of readdirSync(here)) {
    if (!file.endsWith(".test.ts") || file === "meta.test.ts") continue;
    const src = readFileSync(join(here, file), "utf8");
    for (const m of src.matchAll(/test\(\s*["'`]([a-z0-9.\-]+):/g)) {
      ids.add(m[1]);
    }
  }
  return ids;
}

describe("conformance index", () => {
  test("the count is fixed — a silent add or drop fails here", () => {
    expect(REQUIREMENTS.length).toBe(EXPECTED_REQUIREMENT_COUNT);
  });

  test("ids are unique", () => {
    const ids = REQUIREMENTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every requirement has a test that names it", () => {
    const referenced = referencedIds();
    const missing = REQUIREMENTS.filter(
      (r) => !r.review && !referenced.has(r.id),
    ).map((r) => r.id);
    expect(missing, `requirements with no test: ${missing.join(", ")}`).toEqual(
      [],
    );
  });

  test("no test names an unknown requirement id", () => {
    const known = new Set(REQUIREMENTS.map((r) => r.id));
    const hallucinated = [...referencedIds()].filter((id) => !known.has(id));
    expect(
      hallucinated,
      `test ids not in the index: ${hallucinated.join(", ")}`,
    ).toEqual([]);
  });
});
