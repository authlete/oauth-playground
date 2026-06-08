import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  CircleAlert,
  KeyRound,
} from "lucide-react";
import { usePlayground } from "../store/playground";
import { Textarea } from "../components/ui/Textarea";
import { Banner, JwtPanel, StepHeader } from "../components/step";
import { cn } from "../lib/cn";
import { formatDuration, formatLocalTime, shorten } from "../lib/format";
import {
  computeJwtTimings,
  looksLikeJwt,
  parseJwt,
  verifyJwt,
  type JwtParsed,
  type JwtVerifyResult,
} from "../lib/jwt";
import type { InspectorSource } from "../types";

interface Source {
  id: InspectorSource;
  label: string;
  available: boolean;
  raw: string;
}

export function InspectStep() {
  const { state, inspectorUpdate } = usePlayground();
  const { token, discovery, inspector } = state;

  const sources: Source[] = useMemo(
    () => [
      {
        id: "access",
        label: "access_token",
        available: !!token.accessToken,
        raw: token.accessToken ?? "",
      },
      {
        id: "id",
        label: "id_token",
        available: !!token.idToken,
        raw: token.idToken ?? "",
      },
      {
        id: "refresh",
        label: "refresh_token",
        available: !!token.refreshToken,
        raw: token.refreshToken ?? "",
      },
      {
        id: "paste",
        label: "Paste any JWT",
        available: true,
        raw: inspector.pastedText,
      },
    ],
    [token, inspector.pastedText],
  );

  // If the user's prior choice is now unavailable (e.g. id_token before any
  // exchange), fall back to the first available source (always at least "paste").
  useEffect(() => {
    const sel = sources.find((s) => s.id === inspector.source);
    if (!sel || !sel.available) {
      const next = sources.find((s) => s.available);
      if (next && next.id !== inspector.source) {
        inspectorUpdate({ source: next.id });
      }
    }
  }, [sources, inspector.source, inspectorUpdate]);

  const active = sources.find((s) => s.id === inspector.source) ?? sources[0];
  const raw = active.id === "paste" ? inspector.pastedText : active.raw;
  const parsed = useMemo(() => parseJwt(raw), [raw]);
  const expectedIss = discovery.metadata?.issuer;
  const audienceMatches = expectedAudienceCheck(
    parsed,
    state.client.clientId,
    expectedIss,
  );

  const [verify, setVerify] = useState<JwtVerifyResult | "pending" | null>(null);
  useEffect(() => {
    if (!parsed.ok) {
      setVerify(null);
      return;
    }
    setVerify("pending");
    let cancelled = false;
    verifyJwt(parsed.jwt, discovery.jwks).then((result) => {
      if (!cancelled) setVerify(result);
    });
    return () => {
      cancelled = true;
    };
  }, [parsed, discovery.jwks]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const timings = parsed.ok ? computeJwtTimings(parsed.jwt.payload, nowMs) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <Header />

      <div className="mt-5">
        <div className="flex flex-wrap gap-1">
          {sources.map((s) => (
            <SourceTab
              key={s.id}
              active={inspector.source === s.id}
              disabled={!s.available}
              onClick={() => inspectorUpdate({ source: s.id })}
            >
              {s.label}
            </SourceTab>
          ))}
        </div>

        {active.id === "paste" && (
          <Textarea
            mono
            rows={5}
            value={inspector.pastedText}
            onChange={(e) => inspectorUpdate({ pastedText: e.target.value })}
            placeholder="eyJhbGciOi..."
            className="mt-3 min-h-[120px] resize-y"
          />
        )}
      </div>

      {!raw.trim() ? (
        <EmptyState />
      ) : !looksLikeJwt(raw) ? (
        <NotJwtPanel raw={raw} />
      ) : !parsed.ok ? (
        <ParseError reason={parsed.reason} />
      ) : (
        <DecodedView
          jwt={parsed.jwt}
          verify={verify}
          timings={timings}
          audienceMatches={audienceMatches}
          expectedIss={expectedIss}
        />
      )}
    </div>
  );
}

function Header() {
  return (
    <StepHeader
      stepNumber={7}
      title="Token inspector"
      right={
        <span className="text-[11.5px] text-muted-foreground">passive</span>
      }
    />
  );
}

function SourceTab({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md border px-3 py-1.5 text-[12.5px] transition-colors",
        active
          ? "border-[var(--playground-accent)] bg-[color-mix(in_oklch,var(--playground-accent)_15%,transparent)] text-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
        disabled && "opacity-40 cursor-not-allowed hover:text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <Banner tone="info" className="mt-6 p-4 text-[13px] text-muted-foreground">
      Run step 6 first, or pick the Paste tab and drop in any JWT.
    </Banner>
  );
}

function NotJwtPanel({ raw }: { raw: string }) {
  return (
    <div className="mt-5 space-y-3">
      <Banner tone="warn" className="p-4 text-[13.5px]">
        <p className="flex items-center gap-1.5 font-medium">
          <AlertTriangle className="h-4 w-4 text-[var(--status-warn)]" />
          Not a JWT.
        </p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          The value is opaque — most likely a database identifier the AS will
          look up at /introspect or the resource server.
        </p>
      </Banner>
      <div className="rounded-md border border-border bg-card/40 p-3">
        <div className="mb-1.5 text-[11.5px] uppercase tracking-wide text-muted-foreground">
          Raw value
        </div>
        <code className="block break-all font-mono text-[12px]">{raw}</code>
      </div>
    </div>
  );
}

function ParseError({ reason }: { reason: string }) {
  return (
    <Banner tone="error" className="mt-5 p-4 text-[13.5px]">
      <p className="flex items-center gap-1.5 font-medium">
        <CircleAlert className="h-4 w-4 text-[var(--status-error)]" />
        Couldn't parse as a JWT.
      </p>
      <p className="mt-1 text-[12.5px] text-muted-foreground">{reason}</p>
    </Banner>
  );
}

function DecodedView({
  jwt,
  verify,
  timings,
  audienceMatches,
  expectedIss,
}: {
  jwt: JwtParsed;
  verify: JwtVerifyResult | "pending" | null;
  timings: ReturnType<typeof computeJwtTimings> | null;
  audienceMatches: boolean | null;
  expectedIss?: string;
}) {
  return (
    <div className="mt-5 space-y-4">
      <VerificationBanner verify={verify} />

      <JwtPanel jwt={jwt} payloadSubtitle={payloadSubtitle(jwt.payload)} />

      {timings && timings.expAt && <TimingsRow timings={timings} />}

      {(expectedIss || audienceMatches !== null) && (
        <ClaimsRow
          payload={jwt.payload}
          expectedIss={expectedIss}
          audienceMatches={audienceMatches}
        />
      )}
    </div>
  );
}

function VerificationBanner({
  verify,
}: {
  verify: JwtVerifyResult | "pending" | null;
}) {
  if (verify === null) return null;
  if (verify === "pending") {
    return (
      <div className="rounded-md border border-border bg-card/40 p-3 text-[12.5px] text-muted-foreground">
        Verifying signature…
      </div>
    );
  }
  if (verify.ok) {
    return (
      <div className="rounded-md border border-[var(--status-success)]/40 bg-[color-mix(in_oklch,var(--status-success)_8%,transparent)] p-3 text-[13px]">
        <p className="inline-flex items-center gap-1.5">
          <Check className="h-4 w-4 text-[var(--status-success)]" />
          <KeyRound className="h-3.5 w-3.5" />
          <span className="font-medium">Signature verifies.</span>
          <span className="font-mono text-[11.5px] text-muted-foreground">
            alg={verify.alg}
            {verify.kid ? ` · kid=${verify.kid}` : ""}
          </span>
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-[var(--status-warn)]/40 bg-[color-mix(in_oklch,var(--status-warn)_8%,transparent)] p-3 text-[13px]">
      <p className="inline-flex items-center gap-1.5">
        <AlertTriangle className="h-4 w-4 text-[var(--status-warn)]" />
        <span className="font-medium">Signature did not verify.</span>
      </p>
      <p className="mt-1 text-[12px] text-muted-foreground">{verify.reason}</p>
    </div>
  );
}

function TimingsRow({
  timings,
}: {
  timings: NonNullable<ReturnType<typeof computeJwtTimings>>;
}) {
  const left = timings.secondsToExpiry ?? 0;
  const expired = !!timings.expired;
  return (
    <div
      className={cn(
        "rounded-md border p-3 text-[12.5px]",
        expired
          ? "border-[var(--status-warn)]/40 bg-[color-mix(in_oklch,var(--status-warn)_8%,transparent)]"
          : "border-border bg-card/40",
      )}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-medium">
          {expired ? "Expired" : `Expires in ${formatDuration(left)}`}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {timings.iatAt && `iat: ${formatLocalTime(timings.iatAt)}`}
          {timings.expAt && ` · exp: ${formatLocalTime(timings.expAt)}`}
        </span>
      </div>
    </div>
  );
}

function ClaimsRow({
  payload,
  expectedIss,
  audienceMatches,
}: {
  payload: Record<string, unknown>;
  expectedIss?: string;
  audienceMatches: boolean | null;
}) {
  const iss = typeof payload.iss === "string" ? payload.iss : undefined;
  const issMatches =
    expectedIss && iss ? iss === expectedIss : undefined;
  return (
    <div className="rounded-md border border-border bg-card/40 p-3 text-[12.5px]">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {iss && (
          <ClaimRow label="iss" ok={issMatches} value={iss} />
        )}
        {audienceMatches !== null && (
          <ClaimRow
            label="aud"
            ok={audienceMatches}
            value={renderAud(payload.aud)}
          />
        )}
        {typeof payload.sub === "string" && (
          <ClaimRow label="sub" ok={null} value={payload.sub} />
        )}
        {typeof payload.azp === "string" && (
          <ClaimRow label="azp" ok={null} value={payload.azp} />
        )}
      </div>
    </div>
  );
}

function ClaimRow({
  label,
  ok,
  value,
}: {
  label: string;
  ok: boolean | null | undefined;
  value: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-10 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {ok === true ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-[var(--status-success)]" />
      ) : ok === false ? (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[var(--status-warn)]" />
      ) : null}
      <code className="min-w-0 break-all font-mono text-[11.5px]">{value}</code>
    </div>
  );
}

function expectedAudienceCheck(
  parsed: ReturnType<typeof parseJwt>,
  clientId: string,
  _expectedIss?: string,
): boolean | null {
  if (!parsed.ok) return null;
  const aud = parsed.jwt.payload.aud;
  if (typeof aud === "string") return aud === clientId;
  if (Array.isArray(aud)) return aud.includes(clientId);
  return null;
}

function renderAud(aud: unknown): string {
  if (typeof aud === "string") return aud;
  if (Array.isArray(aud)) return aud.join(", ");
  return String(aud ?? "");
}

function payloadSubtitle(payload: Record<string, unknown>): string {
  const sub = typeof payload.sub === "string" ? payload.sub : undefined;
  const claims = Object.keys(payload).length;
  return sub ? `sub=${shorten(sub, 8, 4)} · ${claims} claims` : `${claims} claims`;
}

