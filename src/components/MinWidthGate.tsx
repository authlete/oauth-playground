import { useEffect, useState, type ReactNode } from "react";

const MIN_WIDTH = 1024;

export function MinWidthGate({ children }: { children: ReactNode }) {
  const [tooNarrow, setTooNarrow] = useState(
    typeof window !== "undefined" && window.innerWidth < MIN_WIDTH,
  );

  useEffect(() => {
    const onResize = () => setTooNarrow(window.innerWidth < MIN_WIDTH);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!tooNarrow) return <>{children}</>;

  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-[480px] rounded-lg border border-border bg-card p-6">
        <h1 className="mb-2 text-lg font-semibold tracking-tight">
          OAuth Playground is a desktop tool
        </h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Reopen on a screen at least {MIN_WIDTH}px wide. The playground shows
          network requests, JWTs, and form inputs side-by-side — it needs the
          room.
        </p>
        <p className="text-[12px] text-muted-foreground">
          On a desktop screen wider than {MIN_WIDTH}px? Check that your browser
          zoom is at 100%.
        </p>
      </div>
    </div>
  );
}
