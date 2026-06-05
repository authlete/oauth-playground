import { CircleAlert } from "lucide-react";
import { Banner } from "./Banner";

export interface ErrorPanelProps {
  message: string;
  description?: string;
  status?: number;
  body?: string;
  className?: string;
}

export function ErrorPanel({
  message,
  description,
  status,
  body,
  className,
}: ErrorPanelProps) {
  return (
    <Banner tone="error" className={className}>
      <p className="flex items-center gap-1.5 font-medium">
        <CircleAlert className="h-4 w-4 text-[var(--status-error)]" />
        {message}
        {status ? (
          <span className="font-mono text-muted-foreground">({status})</span>
        ) : null}
      </p>
      {description && (
        <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
      )}
      {body && (
        <pre className="mt-3 max-h-[240px] overflow-auto rounded-sm bg-background/60 p-2 font-mono text-[12px] leading-relaxed">
          {body}
        </pre>
      )}
    </Banner>
  );
}
