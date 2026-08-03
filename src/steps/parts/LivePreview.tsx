import { ArrowRight, Check, Copy, Info } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { RequestPreview } from "../../components/step";
import { previewAuthorize, previewPar, prettyUrl } from "../../lib/requestPreview";
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
  const authEndpoint = props.metadata?.authorization_endpoint;
  // When PAR is on and the AS advertises a /par endpoint, the NEXT request
  // is the POST to /par — not the /authorize navigation. Reflect that.
  const showPar = props.parEnabled && !!parEndpoint;
  // JAR (no PAR): the /authorize URL carries a signed `request` object, so the
  // plain-params block would misrepresent it — show the wire preview instead.
  const showJar = !showPar && props.authRequest.jarEnabled && !!authEndpoint;

  // Card chrome and two-level layout matching <Section>; the header stays a
  // custom component because the title is state-dependent (PAR / JAR / plain).
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 @4xl:p-5">
      <div className="@4xl:grid @4xl:grid-cols-[220px_1fr] @4xl:gap-8">
        <PreviewHeader
          title={showPar ? "PAR request" : showJar ? "Authorize URL (JAR)" : "Authorize URL"}
          subtitle={subtitleFor(showPar, props.parEnabled, props.parPushed)}
        />

        <div className="min-w-0">
          {showPar && parEndpoint ? (
            <RequestPreview
              block={previewPar(parEndpoint, props.client, props.authRequest)}
            />
          ) : showJar && authEndpoint ? (
            <RequestPreview
              block={previewAuthorize(authEndpoint, props.client, props.authRequest)}
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
              After PAR, Authorize will navigate to{" "}
              <code className="font-mono break-all">{props.built.url}</code>
            </p>
          )}

          <ContinueFooter
            showPar={showPar}
            parEnabled={props.parEnabled}
            onContinue={props.onContinue}
          />
        </div>
      </div>
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
      ? "Live preview of the POST to /par — already pushed; request_uri is ready."
      : "Live preview of the POST to /par — the PAR step sends this.";
  }
  if (parEnabled) {
    return "Live preview — PAR is on but the AS has no /par endpoint, so Authorize navigates here directly.";
  }
  return "Live preview, rebuilt on every edit — Authorize navigates here.";
}

// No endpoint line here on purpose: the full URL is the first line of the
// preview block itself — repeating it truncated in a 220px column adds noise.
function PreviewHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4 min-w-0 @4xl:mb-0">
      <h2 className="text-[13px] font-semibold leading-5">{title}</h2>
      <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
        {subtitle}
      </p>
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
    <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-border bg-background/60 px-3 py-2 text-[12px]">
      <p className="inline-flex items-start gap-1.5">
        <Info className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
        <span>
          <span className="font-medium">This step builds the request.</span>
          <span className="ml-1 text-muted-foreground">
            {showPar
              ? "PAR will POST it; Authorize then navigates with the returned request_uri."
              : "Authorize will navigate to this URL."}
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
