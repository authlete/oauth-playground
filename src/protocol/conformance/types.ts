// A single normative requirement the playground's client behaviour must meet,
// traced to a spec. One row per MUST/SHOULD we actually implement and test.

export type Level = "MUST" | "MUST NOT" | "SHOULD" | "SHOULD NOT" | "MAY";

export interface Requirement {
  /** Stable id, e.g. "pkce.challenge". Referenced verbatim by its test's name
   * so the meta-test can prove every requirement is covered. */
  id: string;
  level: Level;
  /** Spec + section the sentence comes from, e.g. "RFC 7636" / "4.2". */
  spec: string;
  section: string;
  /** Which capability it belongs to — the same units the UI is organised by. */
  capability: string;
  /** The normative claim, in plain words. */
  text: string;
  /** Set when the requirement is real but can't be proven by a unit test
   * (UI-level, or needs a live AS) — excluded from the coverage lock. */
  review?: "manual" | "live";
}
