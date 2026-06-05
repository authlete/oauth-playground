import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/quicksand";
import "@fontsource-variable/geist-mono";
import "./index.css";
import App from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("root element missing");
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
