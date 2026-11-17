// Vite config for the hub page (ui/hub/). `npm run build:hub` builds index.html + src/
// into ui/hub/dist/ (git-ignored). Root is this folder, whatever the cwd.
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
});
