import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createUiDevWatchOptions } from "./src/lib/vite-watch";
import { createApiProxy } from "./src/lib/vite-api-proxy";
import { serviceWorkerBuildIdPlugin } from "./src/lib/vite-sw-build-id";
import { readBrowserBuildCommit } from "./src/lib/vite-build-commit";
import { preloadIssueDetail } from "./src/lib/vite-issue-detail-preload";
import { brandManifestPlugin } from "./src/lib/vite-brand-manifest";

const apiProxy = createApiProxy();

export default defineConfig(({ mode }) => {
  // The PWA manifest is a static asset, so its install label is rewritten at
  // build time. Same precedence as the runtime brand: env override, else Gnzs.
  const env = loadEnv(mode, __dirname, "VITE_");
  const brand = env.VITE_BRAND_NAME?.trim() || "Gnzs";

  return {
  define: {
    __PAPERCLIP_BUILD_COMMIT__: JSON.stringify(
      readBrowserBuildCommit(__dirname),
    ),
  },
  plugins: [react(), tailwindcss(), serviceWorkerBuildIdPlugin(), preloadIssueDetail(), brandManifestPlugin(brand)],
  build: {
    minify: "esbuild",
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "board-startup", tags: ["$initial"], priority: 10 },
            { name: "collections", test: /\/src\/pages\/(?:Issues|Inbox|LegacyInbox|CoordinatorTasks)\.tsx$/, priority: 6 },
            { name: "issue-detail", test: /\/src\/pages\/IssueDetail\.tsx$/, priority: 5 },
          ],
        },
      },
    },
  },
  esbuild:
    mode === "production"
      ? {
          // React's component trace uses function names. Keep those useful in
          // error reports without publishing source maps or page context.
          keepNames: true,
          drop: ["console", "debugger"],
          legalComments: "none",
        }
      : undefined,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      lexical: path.resolve(__dirname, "./node_modules/lexical/dist/Lexical.mjs"),
    },
  },
  server: {
    port: 5173,
    watch: createUiDevWatchOptions(process.cwd()),
    proxy: apiProxy,
  },
  preview: {
    port: 3101,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: apiProxy,
  },
};
});
