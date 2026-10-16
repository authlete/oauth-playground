// Rich Authorization Requests (RAR): the `authorization_details` parameter.
// A JSON array of objects, each identified by a `type` the AS defines. The
// only hard rule the spec imposes is the array + per-object `type` string;
// every other field is type-specific (Open Finance, CDR, Berlin Group, …), so
// the playground validates just that shape and passes the rest through as-is.
//
// Single source of truth for: parsing/validation (Auth request editor),
// the wire value (authorize URL / PAR body / token request / JAR claim),
// and the human-readable summary shown next to the raw JSON.

export interface AuthorizationDetail {
  type: string;
  [key: string]: unknown;
}

export type ParseResult =
  { ok: true; details: AuthorizationDetail[] } | { ok: false; message: string };

/** Validate the one thing the spec mandates: a non-empty JSON array whose
 * every element is an object carrying a non-empty string `type`. Everything
 * else is intentionally left alone — the AS owns each type's schema. */
export function parseAuthorizationDetails(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, message: "Empty — add a JSON array or turn this off." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, message: "Not valid JSON." };
  }
  if (!Array.isArray(parsed)) {
    return {
      ok: false,
      message: "Expected a JSON array of authorization-detail objects.",
    };
  }
  if (parsed.length === 0) {
    return {
      ok: false,
      message: "Array is empty — add at least one object, or turn this off.",
    };
  }
  for (let i = 0; i < parsed.length; i++) {
    const el = parsed[i];
    if (typeof el !== "object" || el === null || Array.isArray(el)) {
      return { ok: false, message: `Item ${i + 1} must be an object.` };
    }
    const t = (el as Record<string, unknown>).type;
    if (typeof t !== "string" || !t.trim()) {
      return {
        ok: false,
        message: `Item ${i + 1} needs a non-empty "type" string.`,
      };
    }
  }
  return { ok: true, details: parsed as AuthorizationDetail[] };
}

/** The exact string that goes on the wire. Minified JSON when the text parses;
 * otherwise the raw text verbatim, so the preview never lies about what the
 * AS will actually receive. */
export function authorizationDetailsWireValue(text: string): string {
  const parsed = parseAuthorizationDetails(text);
  return parsed.ok ? JSON.stringify(parsed.details) : text.trim();
}

/** Plain-language bits for one detail, e.g. ["3 actions", "ACC12345"].
 * Generic on purpose — pulls the fields that recur across ecosystems without
 * pretending to know any one type's schema. Accepts the looser response shape
 * too (granted details aren't re-validated for a `type` string). */
export function summarizeDetail(detail: Record<string, unknown>): string[] {
  const parts: string[] = [];
  const actions = arr(detail.actions);
  if (actions) {
    parts.push(
      actions.length === 1 ? String(actions[0]) : `${actions.length} actions`,
    );
  }
  if (typeof detail.identifier === "string") parts.push(detail.identifier);
  const locations = arr(detail.locations);
  if (locations) {
    parts.push(
      locations.length === 1
        ? String(locations[0])
        : `${locations.length} locations`,
    );
  }
  const datatypes = arr(detail.datatypes);
  if (datatypes) parts.push(`${datatypes.length} datatypes`);
  return parts;
}

function arr(v: unknown): unknown[] | null {
  return Array.isArray(v) && v.length > 0 ? v : null;
}

export interface AuthorizationDetailsTemplate {
  label: string;
  hint: string;
  value: string;
}

// Starting points, not schemas. Editable the instant they land in the box.
// Extend freely as new ecosystem shapes come up.
export const AUTHORIZATION_DETAILS_TEMPLATES: AuthorizationDetailsTemplate[] = [
  {
    label: "Account information",
    hint: "Accounts + credit-card accounts, read access",
    value: JSON.stringify(
      [
        {
          type: "Accounts",
          actions: [
            "ReadAccounts",
            "ReadAccountsBalances",
            "ReadAccountsTransactions",
          ],
          identifier: "ACC12345",
          privileges: ["level1", "level2", "level3"],
          purpose: "Gestión de finanzas personales y categorización de gastos",
          consentType: false,
          recurringIndicator: true,
          frequency: "R/2026-09-01T00:00:00Z/P1M",
          validFrom: "2026-08-13T00:00:00Z",
          validTo: "2027-08-13T00:00:00Z",
        },
        {
          type: "CreditCardAccounts",
          actions: ["ReadCreditCardAccounts", "ReadCreditCardTransactions"],
          identifier: "CARD-98771",
          privileges: ["level1", "level2"],
          purpose: "Consolidación de deudas de tarjeta de crédito",
          consentType: false,
          recurringIndicator: true,
          frequency: "R/2026-09-01T00:00:00Z/P1M",
          validFrom: "2026-08-13T00:00:00Z",
          validTo: "2027-08-13T00:00:00Z",
        },
      ],
      null,
      2,
    ),
  },
  {
    label: "Variable recurring payment",
    hint: "VRP with amount policy, limits, schedule and parties",
    value: JSON.stringify(
      [
        {
          type: "VariableRecurringPayments",
          actions: ["CreateVariableRecurringPayments"],
          privileges: ["level1"],
          purpose: "Pago de servicios",
          consentType: true,
          recurringIndicator: true,
          frequency: "R12/2026-09-15T15:00:00Z/P1M",
          validFrom: "2026-09-01T00:00:00Z",
          validTo: "2027-09-15T23:59:59Z",
          instruction: {
            amountPolicy: {
              currency: "CLP",
              perOccurrence: { min: 1000, max: 200000 },
              periodicCaps: { daily: 300000, monthly: 1000000 },
            },
            limits: {
              totalAmountLimit: { currency: "CLP", value: 3000000 },
              maxOccurrences: 24,
            },
            recurrence: { frequency: "MONTHLY", interval: 1, dayOfMonth: 15 },
            schedule: {
              startDate: "2026-09-01",
              firstExecutionDateTime: "2026-09-15T15:00:00Z",
              endDate: "2027-09-01",
              occurrences: 12,
            },
            parties: {
              debtor: {
                institutionId: "14",
                name: "EMPRESA ABC S.A.",
                identification: "76.123.456-7",
                accountType: "CHECKING",
                accountNumber: "123456789",
              },
              creditor: {
                institutionId: "1",
                name: "PROVEEDORES XYZ LTDA.",
                identification: "11.222.333-4",
                accountType: "CHECKING",
                accountNumber: "9876543210",
              },
            },
          },
        },
      ],
      null,
      2,
    ),
  },
];
