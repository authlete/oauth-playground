import { ArrowRight, Check, Copy, Info } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { RequestPreview } from "../../components/step";
import { previewPar, prettyUrl } from "../../lib/requestPreview";
import { cn } from "../../lib/cn";
import type { AuthorizeUrlResult } from "../../lib/authorizeUrl";
import type {
  AuthRequestState,
  ClientConfigState,
  OidcMetadata,
} from "../../types";

interface LivePreviewProps {
  built: AuthorizeUrlResult;
  metadata: OidcMetadata | undefined;
  client: ClientConfigState;
  authRequest: AuthRequestState;
  parEnabled: boolean;
  parPushed: boolean;
  copied: "url" | "curl" | null;
  onCopy: (kind: "url" | "curl") => void;
  onContinue: () => void;
}

export function LivePreview(props: LivePreviewProps) {
  if (!props.built.ok) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-3 text-[12.5px] text-muted-foreground">
        {props.built.message}
      </div>
    );
  }

  const parEndpoint = props.metadata?.pushed_authorization_request_endpoint;
  // When PAR is on and the AS advertises a /par endpoint, the NEXT request
  // is the POST to /par — not the /authorize navigation. Reflect that.
  const showPar = props.parEnabled && !!parEndpoint;

  return (
    <div>
      <PreviewHeader
        title={showPar ? "PAR request" : "Authorize URL"}
        subtitle={subtitleFor(showPar, props.parEnabled, props.parPushed)}
        endpoint={
          showPar ? parEndpoint : props.metadata?.authorization_endpoint
        }
      />

      {showPar && parEndpoint ? (
        <RequestPreview
          className="mt-1.5"
          block={previewPar(parEndpoint, props.client, props.authRequest)}
        />
      ) : (
        <AuthorizeUrlBlock
          url={props.built.url}
          copied={props.copied}
          onCopy={props.onCopy}
        />
      )}

      {showPar && props.parPushed && (
        <p className="mt-3 text-[11.5px] text-muted-foreground">
          After PAR, step 5 will navigate to{" "}
          <code className="font-mono break-all">{props.built.url}</code>
        </p>
      )}

      <ContinueFooter
        showPar={showPar}
        parEnabled={props.parEnabled}
        onContinue={props.onContinue}
      />
    </div>
  );
}

function subtitleFor(
  showPar: boolean,
  parEnabled: boolean,
  parPushed: boolean,
): string {
  if (showPar) {
    return parPushed
      ? "live preview · POST to /par (already pushed — request_uri ready)"
      : "live preview · POST to /par — step 4 sends this";
  }
  if (parEnabled) {
    return "live preview · /authorize URL — PAR is on but the AS has no /par endpoint";
  }
  return "live preview · /authorize URL — step 5 navigates here";
}

function PreviewHeader({
  title,
  subtitle,
  endpoint,
}: {
  title: string;
  subtitle: string;
  endpoint?: string;
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <span className="text-[12.5px] font-medium">{title}</span>
        <span className="ml-2 text-[11px] text-muted-foreground">
          {subtitle}
        </span>
      </div>
      {endpoint && (
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          → {endpoint}
        </span>
      )}
    </div>
  );
}

function AuthorizeUrlBlock({
  url,
  copied,
  onCopy,
}: {
  url: string;
  copied: "url" | "curl" | null;
  onCopy: (kind: "url" | "curl") => void;
}) {
  return (
    <>
      <pre
        className={cn(
          "max-h-[200px] overflow-auto whitespace-pre-wrap break-all",
          "rounded-md border border-border bg-background/60 p-3 font-mono text-[12.5px] leading-relaxed",
        )}
      >
        {prettyUrl(url)}
      </pre>
      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton kind="url" copied={copied === "url"} onClick={() => onCopy("url")} />
        <CopyButton kind="curl" copied={copied === "curl"} onClick={() => onCopy("curl")} />
      </div>
    </>
  );
}

function CopyButton({
  kind,
  copied,
  onClick,
}: {
  kind: "url" | "curl";
  copied: boolean;
  onClick: () => void;
}) {
  const label = kind === "url" ? "Copy URL" : "Copy as curl";
  return (
    <Button type="button" variant="secondary" onClick={onClick}>
      {copied ? (
        <>
          <Check className="h-4 w-4" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          {label}
        </>
      )}
    </Button>
  );
}

function ContinueFooter({
  showPar,
  parEnabled,
  onContinue,
}: {
  showPar: boolean;
  parEnabled: boolean;
  onContinue: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-border bg-card/40 px-3 py-2 text-[12px]">
      <p className="inline-flex items-start gap-1.5">
        <Info className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
        <span>
          <span className="font-medium">This step builds the request.</span>
          <span className="ml-1 text-muted-foreground">
            {showPar
              ? "Step 4 will POST it; step 5 then navigates with the returned request_uri."
              : "Step 5 will navigate to this URL when you Authorize."}
          </span>
        </span>
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onContinue}
        className="shrink-0 text-[var(--playground-accent)]"
      >
        {parEnabled ? "Continue to PAR" : "Continue to Authorize"}
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
