/**
 * Relative paths (the site lives under /medoc-ai/), the service worker that
 * makes it an offline PWA, and a CSP injected into the built page.
 *
 * The CSP lets the page call any https API (your AI provider, models.dev,
 * openFDA) and local model servers, and nothing else. It is left out of the dev
 * server, whose hot reload needs inline scripts.
 */
import { execSync } from "node:child_process";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json" with { type: "json" };

/** Runs a git command; null where git or the answer is unavailable (as in maxgfr/cursus). */
function git(args: string): string | null {
  try {
    return (
      execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim() || null
    );
  } catch {
    return null;
  }
}

/** The build: the app's version, the commit (CI's GITHUB_SHA, else HEAD) and when it was built. */
const BUILD = {
  version: pkg.version,
  commit: process.env.GITHUB_SHA?.slice(0, 7) || git("rev-parse --short HEAD") || "dev",
  builtAt: new Date().toISOString(),
};

/**
 * version.json: what the server currently publishes. The app compares it with
 * the build it runs to tell whether it is the latest version.
 */
function versionFile(): Plugin {
  return {
    name: "version-file",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify(BUILD) });
    },
  };
}

export const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:* data: blob:",
  "img-src 'self' blob: data:",
  "media-src 'self' blob: mediastream:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const DESCRIPTION =
  "Scan a medicine box, read its official leaflet, keep your medicine cabinet and treatments, ask an AI about them. Bring your own model; your data stays on your device.";

/** The CSP and the page's meta tags, in the build only. */
function head(): Plugin {
  return {
    name: "head",
    apply: "build",
    transformIndexHtml(html) {
      const tags = [
        `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
        `<meta name="referrer" content="no-referrer" />`,
        `<meta name="description" content="${DESCRIPTION}" />`,
        `<meta property="og:title" content="Medoc" />`,
        `<meta property="og:description" content="${DESCRIPTION}" />`,
      ].join("\n    ");
      const charset = '<meta charset="UTF-8" />';
      return html.replace(charset, `${charset}\n    ${tags}`);
    },
  };
}

export default defineConfig({
  base: "./",
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [
    react(),
    tailwindcss(),
    head(),
    versionFile(),
    VitePWA({
      // A new version waits until the person accepts it (the app says one is there), so a
      // form being filled is never reloaded under their fingers.
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Medoc",
        short_name: "Medoc",
        description: DESCRIPTION,
        lang: "fr",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#f5f5f4",
        theme_color: "#047857",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        // The app shell and the scanner's wasm; medicine data is cached as it is read.
        globPatterns: ["**/*.{js,css,html,svg,wasm,json}"],
        globIgnores: ["data/**", "models.json", "version.json"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            // What changes every day: fresh when online, the last copy offline.
            urlPattern: /\/data\/(countries\.json|[a-z]{2}\/(manifest|alerts)\.json)$/,
            handler: "NetworkFirst",
            options: { cacheName: "medoc-index", networkTimeoutSeconds: 4 },
          },
          {
            // The index itself: always the published version when online (a revalidation costs
            // a 304), the last copy read when offline.
            urlPattern: /\/data\/[a-z]{2}\/(search\.json|codes\/|meds\/|docs\/)/,
            handler: "NetworkFirst",
            options: {
              cacheName: "medoc-data",
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 2000 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /^https:\/\/api\.fda\.gov\//,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "medoc-openfda",
              expiration: { maxEntries: 300, maxAgeSeconds: 14 * 86_400 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /\/models\.json$/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "medoc-models" },
          },
        ],
      },
    }),
  ],
  build: { target: "es2023", chunkSizeWarningLimit: 2000 },
  preview: { port: 4318, strictPort: true },
});
