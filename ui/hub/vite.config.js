// Vite config for the hub page (ui/hub/). `npm run build:hub` builds index.html + src/
// into ui/hub/dist/ (git-ignored). Root is this folder, whatever the cwd. The page takes the
// XenomoonForge tokens (the :root block of ui/agent-ui.css) and the font links of ui/index.html
// at build time, so there is one source; the rest of agent-ui.css is the main UI's, not the hub's.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { tokenBlock } from "./src/tokens.js";

const UI_CSS = fileURLToPath(new URL("../agent-ui.css", import.meta.url));
const UI_HTML = fileURLToPath(new URL("../index.html", import.meta.url));
const HUB_CSS = fileURLToPath(new URL("./src/hub.css", import.meta.url));

/** The Google Fonts stylesheet URL of ui/index.html (entities decoded); throws when there is none.
 * @param {string} html @returns {string} */
export function fontsHref(html) {
  const m = /href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/.exec(html);
  if (!m?.[1]) throw new Error("hub build: no Google Fonts link in ui/index.html");
  return m[1].replaceAll("&amp;", "&");
}

/** @returns {import("vite").Plugin} */
const xenomoonIdentity = () => ({
  name: "xenomoon-identity",
  transformIndexHtml: () => [
    { tag: "link", attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" } },
    {
      tag: "link",
      attrs: { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "anonymous" },
    },
    {
      tag: "link",
      attrs: { rel: "stylesheet", href: fontsHref(fs.readFileSync(UI_HTML, "utf8")) },
    },
    {
      tag: "style",
      children: tokenBlock(fs.readFileSync(UI_CSS, "utf8"), fs.readFileSync(HUB_CSS, "utf8")),
      injectTo: "head",
    },
  ],
});

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), xenomoonIdentity()],
  build: { outDir: "dist", emptyOutDir: true },
});
