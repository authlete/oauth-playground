import { useState } from "react";
import { ArrowRight, Check, Copy, Loader2, RotateCw } from "lucide-react";
import { usePlayground } from "../store/playground";
import { Button } from "../components/ui/Button";
import {
  Banner,
  ErrorPanel,
  InfoCard,
  StatusPill,
  StepHeader,
  type StatusTone,
} from "../components/step";
import { formatBytes, formatValue } from "../lib/format";
import { fetchUserInfo } from "../lib/userInfo";

export function UserInfoStep() {
  const {
    state,
    userInfoUpdate,
    setStepStatus,
    setActiveStep,
    networkAdd,
    networkUpdate,
  } = usePlayground();
  const info = state.userInfo;
  const endpoint = state.discovery.metadata?.userinfo_endpoint;
  const accessToken = state.token.accessToken;
  const canFetch = !!endpoint && !!accessToken;
  const [copied, setCopied] = useState(false);

  const onFetch = async () => {
    if (!state.discovery.metadata || !accessToken || !canFetch) return;
    userInfoUpdate({
      status: "loading",
      claims: undefined,
      errorMessage: undefined,
      errorStatus: undefined,
      errorBody: undefined,
    });
    const result = await fetchUserInfo({
      metadata: state.discovery.metadata,
      accessToken,
      onStart: networkAdd,
      onFinish: networkUpdate,
    });
    if (result.ok) {
      userInfoUpdate({
        status: "success",
        claims: result.claims,
        fetchedAt: Date.now(),
      });
      setStepStatus("userinfo", "done");
    } else {
      userInfoUpdate({
        status: "error",
        errorMessage: result.message,
        errorStatus: result.status,
        errorBody: result.body,
      });
    }
  };

  const onCopy = async () => {
    if (!info.claims) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(info.claims, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <StepHeader stepNumber={8} title="UserInfo" right={renderPill(info.status)} />

      {!accessToken && (
        <Banner tone="warn" className="mt-5">
          <p>No access token yet — run step 6 first.</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-[var(--playground-accent)]"
            onClick={() => setActiveStep("token")}
          >
            Go to Token exchange →
          </Button>
        </Banner>
      )}

      {accessToken && !endpoint && (
        <Banner tone="error" className="mt-5">
          <p className="font-medium">This AS does not advertise userinfo_endpoint.</p>
          <p className="mt-1 text-muted-foreground">
            The AS may not be an OIDC provider (pure OAuth 2.0).
          </p>
        </Banner>
      )}

      {endpoint && (
        <InfoCard label="Will GET" url={endpoint} className="mt-5">
          <p className="text-muted-foreground">
            With <code className="font-mono">Authorization: Bearer ...</code>
          </p>
        </InfoCard>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {info.status === "loading" ? (
          <Button disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
            Fetching…
          </Button>
        ) : info.status === "success" ? (
          <Button variant="secondary" onClick={onFetch} disabled={!canFetch}>
            <RotateCw className="h-4 w-4" />
            Re-fetch
          </Button>
        ) : (
          <Button onClick={onFetch} disabled={!canFetch}>
            <ArrowRight className="h-4 w-4" />
            Fetch UserInfo →
          </Button>
        )}
      </div>

      {info.status === "success" && info.claims && (
        <ClaimsPanel claims={info.claims} onCopy={onCopy} copied={copied} />
      )}

      {info.status === "error" && (
        <ErrorPanel
          className="mt-4"
          message={info.errorMessage ?? "Unknown error."}
          status={info.errorStatus}
          body={info.errorBody}
        />
      )}
    </div>
  );
}

function ClaimsPanel({
  claims,
  onCopy,
  copied,
}: {
  claims: Record<string, unknown>;
  onCopy: () => void;
  copied: boolean;
}) {
  const entries = Object.entries(claims);
  return (
    <Banner tone="success" className="mt-4 p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[13.5px] font-medium">
          <Check className="h-4 w-4 text-[var(--status-success)]" />
          {entries.length} claim{entries.length === 1 ? "" : "s"} returned
        </p>
        <Button variant="ghost" size="sm" onClick={onCopy}>
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy JSON
            </>
          )}
        </Button>
      </div>
      <table className="mt-3 w-full text-[12.5px]">
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k} className="border-b border-border/40 last:border-0">
              <td className="w-44 py-1.5 pr-3 align-top font-mono text-muted-foreground">
                {k}
              </td>
              <td className="break-all py-1.5 font-mono">
                <ClaimValue value={v} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Banner>
  );
}

function ClaimValue({ value }: { value: unknown }) {
  if (typeof value === "string") {
    const image = parseImageValue(value);
    if (image) return <ImageClaim {...image} raw={value} />;
  }
  return <>{formatValue(value)}</>;
}

interface ImageInfo {
  src: string;
  mime?: string;
  sizeLabel?: string;
}

function parseImageValue(value: string): ImageInfo | null {
  // Inline data URI — safe to render directly.
  const dataMatch = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (dataMatch) {
    const [, mime, b64] = dataMatch;
    // Approximate decoded byte count from base64 length.
    const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
    return { src: value, mime, sizeLabel: formatBytes(bytes) };
  }
  // External image URL — must be https and end in a known image extension.
  if (/^https:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp|svg)(\?[^\s]*)?$/i.test(value)) {
    return { src: value };
  }
  return null;
}

function ImageClaim({
  src,
  mime,
  sizeLabel,
  raw,
}: ImageInfo & { raw: string }) {
  const [showRaw, setShowRaw] = useState(false);
  if (showRaw) {
    return (
      <div>
        <div className="rounded-sm bg-background/60 p-2 font-mono text-[11.5px] leading-relaxed break-all max-h-[160px] overflow-auto">
          {raw}
        </div>
        <button
          type="button"
          onClick={() => setShowRaw(false)}
          className="mt-1 text-[11px] text-[var(--playground-accent)] hover:underline"
        >
          ← show image
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3">
      <img
        src={src}
        alt="claim"
        referrerPolicy="no-referrer"
        className="h-16 w-16 shrink-0 rounded-full bg-muted object-cover ring-1 ring-border"
        loading="lazy"
      />
      <div className="flex flex-col gap-1 text-[11.5px] text-muted-foreground">
        <span>{mime ?? src}</span>
        {sizeLabel && <span>{sizeLabel}</span>}
        <button
          type="button"
          onClick={() => setShowRaw(true)}
          className="self-start text-[var(--playground-accent)] hover:underline"
        >
          Show raw →
        </button>
      </div>
    </div>
  );
}

function renderPill(status: "idle" | "loading" | "success" | "error") {
  if (status === "idle") return null;
  const map: Record<Exclude<typeof status, "idle">, { tone: StatusTone; label: string; spinning?: boolean }> = {
    loading: { tone: "muted", label: "fetching", spinning: true },
    success: { tone: "success", label: "claims received" },
    error: { tone: "error", label: "failed" },
  };
  const p = map[status];
  return (
    <StatusPill tone={p.tone} spinning={p.spinning}>
      {p.label}
    </StatusPill>
  );
}
