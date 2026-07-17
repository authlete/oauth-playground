import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, CircleAlert, KeyRound, Loader2 } from "lucide-react";
import { usePlayground } from "../store/playground";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { StatusPill, StepHeader } from "../components/step";
import { cn } from "../lib/cn";
import { validateClientConfig } from "../lib/clientConfig";
import { validateAndImportJwk } from "../lib/jwk";
import type { ClientAuthMethod } from "../types";

const AUTH_METHODS: Array<{ value: ClientAuthMethod; label: string; hint: string }> = [
  {
    value: "none",
    label: "none (public — PKCE only)",
    hint: "No client credential at /token. PKCE is required and is configured in step 3.",
  },
  {
    value: "client_secret_basic",
    label: "client_secret_basic",
    hint: "Sends client_id:client_secret as HTTP Basic on /token. RFC 6749 §2.3.1.",
  },
  {
    value: "client_secret_post",
    label: "client_secret_post",
    hint: "Sends client_id and client_secret in the form body of /token.",
  },
  {
    value: "private_key_jwt",
    label: "private_key_jwt",
    hint: "Browser signs a client_assertion JWT with the JWK below. RFC 7523.",
  },
];

export function ClientStep() {
  const { state, clientUpdate } = usePlayground();
  const cfg = state.client;
  const [jwkValidating, setJwkValidating] = useState(false);

  // A signing key is needed for private_key_jwt client auth AND for JAR
  // (RFC 9101) request objects — a public/PKCE client can enable JAR too.
  const needsSigningKey =
    cfg.authMethod === "private_key_jwt" || state.authRequest.jarEnabled;

  // Debounced JWK validation: any change to the pasted text triggers a fresh
  // Web Crypto import. We hold the CryptoKey in memory only (§8).
  useEffect(() => {
    if (!needsSigningKey) return;
    const text = cfg.privateKey.jwkText;
    if (!text.trim()) {
      clientUpdate({ privateKey: { jwkText: text, status: "empty" } });
      return;
    }
    let cancelled = false;
    setJwkValidating(true);
    const handle = window.setTimeout(async () => {
      const result = await validateAndImportJwk(text);
      if (cancelled) return;
      setJwkValidating(false);
      if (result.ok) {
        clientUpdate({
          privateKey: {
            jwkText: text,
            status: "valid",
            alg: result.alg,
            kid: result.kid,
            errorMessage: undefined,
          },
        });
      } else {
        clientUpdate({
          privateKey: {
            jwkText: text,
            status: "invalid",
            alg: undefined,
            kid: undefined,
            errorMessage: result.message,
          },
        });
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [needsSigningKey, cfg.privateKey.jwkText, clientUpdate]);

  const validation = useMemo(() => validateClientConfig(cfg), [cfg]);

  return (
    <div className="mx-auto max-w-3xl">
      <StepHeader
        stepNumber={2}
        title="Client config"
        right={
          validation.ok ? (
            <StatusPill tone="success">ready</StatusPill>
          ) : (
            <StatusPill tone="muted" icon={Loader2}>
              configuring
            </StatusPill>
          )
        }
      />

      <div className="mt-6 space-y-5">
        <Field
          label="Client ID"
          hint="Accepts a plain ID or a URL. ASes that support OpenID Federation or Client ID Metadata Document will resolve a URL automatically."
        >
          <Input
            mono
            value={cfg.clientId}
            onChange={(e) => clientUpdate({ clientId: e.target.value })}
            placeholder="2234376661"
            autoComplete="off"
            spellCheck={false}
          />
          {looksUrlShaped(cfg.clientId) && (
            <span className="mt-1 inline-block rounded-sm bg-[color-mix(in_oklch,var(--playground-accent)_12%,transparent)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--playground-accent)]">
              URL identifier
            </span>
          )}
        </Field>

        <Field
          label="Authentication method"
          hint={AUTH_METHODS.find((m) => m.value === cfg.authMethod)?.hint}
        >
          <Select
            value={cfg.authMethod}
            onChange={(e) =>
              clientUpdate({ authMethod: e.target.value as ClientAuthMethod })
            }
          >
            {AUTH_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>

        {(cfg.authMethod === "client_secret_basic" ||
          cfg.authMethod === "client_secret_post") && (
          <Field
            label="Client secret"
            hint="Held in memory for this session only — never persisted, never shared via URL."
          >
            <Input
              type="password"
              mono
              value={cfg.clientSecret}
              onChange={(e) => clientUpdate({ clientSecret: e.target.value })}
              placeholder="paste secret"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        )}

        {needsSigningKey && (
          <Field
            label="Private key (JWK)"
            hint={
              cfg.authMethod === "private_key_jwt"
                ? "Signs the client_assertion (private_key_jwt) and, if JAR is on, the request object. Paste a JWK with a private exponent (`d`); never persisted."
                : "Signs the JAR request object (RFC 9101). Paste a JWK with a private exponent (`d`); never persisted."
            }
          >
            <Textarea
              mono
              rows={10}
              value={cfg.privateKey.jwkText}
              onChange={(e) =>
                clientUpdate({
                  privateKey: { ...cfg.privateKey, jwkText: e.target.value },
                })
              }
              placeholder={'{\n  "kty": "EC",\n  "crv": "P-256",\n  "kid": "...",\n  "x": "...",\n  "y": "...",\n  "d": "..."\n}'}
              className="min-h-[200px] resize-y"
            />
            <JwkStatusLine
              validating={jwkValidating}
              status={cfg.privateKey.status}
              alg={cfg.privateKey.alg}
              kid={cfg.privateKey.kid}
              errorMessage={cfg.privateKey.errorMessage}
            />
          </Field>
        )}

        <Field
          label="Redirect URI"
          hint={
            "Used by step 5 callback handling. Pre-filled to this playground's origin; override only if your AS expects a different one."
          }
        >
          <Input
            mono
            value={cfg.redirectUri}
            onChange={(e) => clientUpdate({ redirectUri: e.target.value })}
            placeholder="http://localhost:5173/callback"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        {!validation.ok && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-[12.5px] text-muted-foreground">
            {validation.message}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12.5px] font-medium">{label}</label>
      {children}
      {hint && (
        <p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function looksUrlShaped(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function JwkStatusLine({
  validating,
  status,
  alg,
  kid,
  errorMessage,
}: {
  validating: boolean;
  status: "empty" | "valid" | "invalid";
  alg?: string;
  kid?: string;
  errorMessage?: string;
}) {
  if (status === "empty") return null;
  if (validating) {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Validating JWK…
      </p>
    );
  }
  if (status === "valid") {
    return (
      <p
        className={cn(
          "mt-2 inline-flex items-center gap-1.5 text-[12.5px]",
          "text-[var(--status-success)]",
        )}
      >
        <KeyRound className="h-3.5 w-3.5" />
        <span className="font-mono">
          alg: <span className="font-semibold">{alg}</span>
          {kid ? (
            <>
              {" · kid: "}
              <span className="font-semibold">{kid}</span>
            </>
          ) : null}
        </span>
        <Check className="h-3.5 w-3.5" />
      </p>
    );
  }
  return (
    <p
      className={cn(
        "mt-2 inline-flex items-start gap-1.5 text-[12.5px]",
        "text-[var(--status-error)]",
      )}
    >
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{errorMessage}</span>
    </p>
  );
}

