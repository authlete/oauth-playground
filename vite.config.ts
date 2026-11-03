import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "node:path";
import { buildClientMetadata } from "./src/protocol/cimd";

// Serve the playground's own Client ID Metadata Document (CIMD). In dev the
// origin is the live request host; at build it's baked from the deploy origin
// (VITE_PUBLIC_ORIGIN) into a static dist/client-metadata.json that Vercel
// serves directly (existing files win over the SPA rewrite).
function cimdDocument(): Plugin {
  const json = (origin: string) =>
    `${JSON.stringify(buildClientMetadata(origin), null, 2)}\n`;
  return {
    name: "cimd-client-metadata",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req.url ?? "").split("?")[0] !== "/client-metadata.json") {
          return next();
        }
        const scheme = (req.socket as { encrypted?: boolean }).encrypted
          ? "https"
          : "http";
        const host = req.headers.host ?? "localhost:5173";
        res.setHeader("content-type", "application/json");
        res.end(json(`${scheme}://${host}`));
      });
    },
    generateBundle() {
      const origin = process.env.VITE_PUBLIC_ORIGIN ?? "http://localhost:5173";
      this.emitFile({
        type: "asset",
        fileName: "client-metadata.json",
        source: json(origin),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Opt-in HTTPS (VITE_HTTPS=1). FAPI clients require https redirect URIs, so the
  // callback must be https even in local dev; basic-ssl serves a self-signed cert.
  const env = loadEnv(mode, process.cwd(), "");
  const httpsEnabled = Boolean(env.VITE_HTTPS);
  return {
    plugins: [
      react(),
      tailwind(),
      cimdDocument(),
      ...(httpsEnabled ? [basicSsl()] : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
    },
  };
});
