import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Webview build: HTML entry reusing the same App, output into the extension package.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../vscode-extension/dist-webview",
    emptyOutDir: true,
    rollupOptions: {
      input: "webview.html",
    },
  },
});
