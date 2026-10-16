// Minimal OpenAPI 3.x reader for the Resource call step: probes
// {resource}/openapi.json (the de-facto well-known location) and extracts
// method + path + summary + required OAuth scopes + a body example per
// operation. Absence or an unparseable document is not an error — the step
// simply degrades to the free-form request builder.

import { runFetch } from "./discovery";
import type { HttpMethod, NetworkEntry, ResourceOperation } from "../types";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export async function fetchOpenApiOperations(
  resourceUrl: string,
  callbacks: {
    onStart: (entry: NetworkEntry) => void;
    onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
  },
): Promise<ResourceOperation[] | undefined> {
  const base = resourceUrl.trim().replace(/\/+$/, "");
  if (!base) return undefined;

  const result = await runFetch({
    method: "GET",
    url: `${base}/openapi.json`,
    ...callbacks,
  });
  if (!result.ok) return undefined;

  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(result.body) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const paths = doc.paths;
  if (typeof paths !== "object" || paths === null) return undefined;

  const operations: ResourceOperation[] = [];
  for (const [path, item] of Object.entries(paths as Record<string, unknown>)) {
    if (typeof item !== "object" || item === null) continue;
    // Discovery machinery, not a business operation — it has its own step.
    if (path.startsWith("/.well-known/")) continue;
    for (const method of METHODS) {
      const op = (item as Record<string, unknown>)[method.toLowerCase()];
      if (typeof op !== "object" || op === null) continue;
      const record = op as Record<string, unknown>;
      operations.push({
        method,
        path,
        filledPath: fillPathParams(
          path,
          item as Record<string, unknown>,
          record,
        ),
        summary:
          typeof record.summary === "string" ? record.summary : undefined,
        scopes: collectScopes(record.security),
        requestBodyExample: extractBodyExample(record.requestBody),
      });
    }
  }
  return operations.length > 0 ? operations : undefined;
}

/** Substitute {param} segments with the document's example values (checked
 * at both path-item and operation level), so "Use" fills a callable URL
 * instead of a literal template. */
function fillPathParams(
  path: string,
  pathItem: Record<string, unknown>,
  operation: Record<string, unknown>,
): string {
  const params = [
    ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
    ...(Array.isArray(operation.parameters) ? operation.parameters : []),
  ];
  let filled = path;
  for (const p of params) {
    if (typeof p !== "object" || p === null) continue;
    const param = p as Record<string, unknown>;
    if (param.in !== "path" || typeof param.name !== "string") continue;
    const schema =
      typeof param.schema === "object" && param.schema !== null
        ? (param.schema as Record<string, unknown>)
        : undefined;
    const example = param.example ?? schema?.example;
    if (example === undefined) continue;
    filled = filled.replaceAll(`{${param.name}}`, String(example));
  }
  return filled;
}

/** Flatten OpenAPI `security: [{scheme: [scopes]}]` into a scope list. */
function collectScopes(security: unknown): string[] {
  if (!Array.isArray(security)) return [];
  const scopes = new Set<string>();
  for (const requirement of security) {
    if (typeof requirement !== "object" || requirement === null) continue;
    for (const value of Object.values(requirement)) {
      if (Array.isArray(value)) {
        for (const s of value) if (typeof s === "string") scopes.add(s);
      }
    }
  }
  return [...scopes];
}

function extractBodyExample(requestBody: unknown): string | undefined {
  if (typeof requestBody !== "object" || requestBody === null) return undefined;
  const content = (requestBody as Record<string, unknown>).content;
  if (typeof content !== "object" || content === null) return undefined;
  const json = (content as Record<string, unknown>)["application/json"];
  if (typeof json !== "object" || json === null) return undefined;
  const example = (json as Record<string, unknown>).example;
  if (example === undefined) return undefined;
  try {
    return JSON.stringify(example, null, 2);
  } catch {
    return undefined;
  }
}
