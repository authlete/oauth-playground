import { useEffect, useState } from "react";
import { Check, CircleAlert } from "lucide-react";
import "@fontsource-variable/quicksand";
import "@fontsource-variable/geist-mono";
import {
  CALLBACK_MESSAGE_TYPE,
  CALLBACK_STORAGE_KEY,
  parseCallbackUrl,
  type CallbackParams,
} from "../lib/callback";

const AUTO_CLOSE_SECONDS = 3;

export function CallbackPage() {
  const [result, setResult] = useState<CallbackParams | null>(null);
  const [delivered, setDelivered] = useState<{ post: boolean; storage: boolean }>(
    { post: false, storage: false },
  );
  const [remaining, setRemaining] = useState(AUTO_CLOSE_SECONDS);

  useEffect(() => {
    const params = parseCallbackUrl(window.location.href);
    setResult(params);

    // postMessage to opener (same-origin so safe).
    let postOk = false;
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(
          { type: CALLBACK_MESSAGE_TYPE, ...params },
          window.location.origin,
        );
        postOk = true;
      } catch {
        // ignore — opener may be cross-origin if COOP severed
      }
    }

    // localStorage event fallback (works across tabs without opener too).
    let storageOk = false;
    try {
      localStorage.setItem(CALLBACK_STORAGE_KEY, JSON.stringify(params));
      storageOk = true;
    } catch {
      // ignore
    }

    setDelivered({ post: postOk, storage: storageOk });

    const interval = window.setInterval(() => {
      setRemaining((n) => {
        if (n <= 1) {
          window.clearInterval(interval);
          if (window.opener && !window.opener.closed) {
            try {
              window.close();
            } catch {
              // ignore
            }
          }
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  if (!result) return null;

  const hasError = !!result.error;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
        <div className="mb-3 flex items-center gap-2">
          {hasError ? (
            <CircleAlert className="h-5 w-5 text-[var(--status-error)]" />
          ) : (
            <Check className="h-5 w-5 text-[var(--status-success)]" />
          )}
          <h1 className="text-lg font-semibold tracking-tight">
            {hasError ? "Authorization failed" : "Authorization complete"}
          </h1>
        </div>
        {hasError ? (
          <>
            <p className="font-mono text-[13px]">
              <span className="text-[var(--status-error)]">{result.error}</span>
            </p>
            {result.error_description && (
              <p className="mt-1 text-[13px] text-muted-foreground">
                {result.error_description}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-[13px] text-muted-foreground">
              Returning the code to the playground tab.
            </p>
            <dl className="mt-3 space-y-1 text-[12px]">
              {result.code && (
                <Row label="code">
                  <Truncated value={result.code} />
                </Row>
              )}
              {result.state && (
                <Row label="state">
                  <Truncated value={result.state} />
                </Row>
              )}
              {result.iss && <Row label="iss">{result.iss}</Row>}
            </dl>
          </>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[11.5px] text-muted-foreground">
          <span>
            Posted: {delivered.post ? "opener ✓" : "opener —"}
            {" · "}
            {delivered.storage ? "storage ✓" : "storage —"}
          </span>
          <span>
            {remaining > 0
              ? `Closing in ${remaining}s`
              : "You can close this tab."}
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-14 shrink-0 font-medium">{label}</dt>
      <dd className="flex-1 break-all font-mono">{children}</dd>
    </div>
  );
}

function Truncated({ value }: { value: string }) {
  if (value.length <= 32) return <>{value}</>;
  return (
    <>
      {value.slice(0, 12)}
      <span className="text-muted-foreground">…</span>
      {value.slice(-8)}
    </>
  );
}
