import { useEffect } from "react";
import { PlaygroundProvider, usePlayground } from "./store/playground";
import { TopBar } from "./components/TopBar";
import { LeftRail } from "./components/LeftRail";
import { NetworkLog } from "./components/NetworkLog";
import { CenterPane } from "./components/CenterPane";
import { MinWidthGate } from "./components/MinWidthGate";
import { CallbackPage } from "./components/CallbackPage";
import { hasCallbackParams } from "./lib/callback";

export default function App() {
  // The AS redirects to /callback?code=...&state=... — render a tiny receiver
  // tab that posts the result back to the main playground tab.
  if (
    typeof window !== "undefined" &&
    window.location.pathname === "/callback" &&
    hasCallbackParams(window.location.href)
  ) {
    return <CallbackPage />;
  }
  return (
    <PlaygroundProvider>
      <MinWidthGate>
        <Shell />
      </MinWidthGate>
    </PlaygroundProvider>
  );
}

function Shell() {
  useKeyboardShortcuts();
  return (
    <div className="flex h-screen flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <LeftRail />
        <CenterPane />
        <NetworkLog />
      </div>
    </div>
  );
}

function useKeyboardShortcuts() {
  const { toggleTheme, networkClear } = usePlayground();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore shortcuts while typing into inputs / textareas.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        toggleTheme();
      } else if (mod && e.key.toLowerCase() === "l") {
        e.preventDefault();
        networkClear();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleTheme, networkClear]);
}
