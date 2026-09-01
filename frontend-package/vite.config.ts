import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      '/api': {
        /*
         * The plant's backend by default; overridable for local work.
         *
         * This was hardcoded to a local demo backend during development, which
         * left a standing "remember to change it back before committing" — the
         * kind of instruction that works right up until the once it doesn't,
         * and then points a client's build at a machine that does not exist.
         *
         * The default is now the real thing, so committing it is correct at any
         * moment. A developer running a local backend sets FAKIEH_API_TARGET
         * instead of editing a tracked file:
         *
         *   FAKIEH_API_TARGET=http://127.0.0.1:5001 npm run dev
         */
        target: process.env.FAKIEH_API_TARGET ?? 'http://192.168.0.60:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
