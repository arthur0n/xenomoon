// Hub page entry: mounts <App /> into #root of ui/hub/index.html.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

const root = document.getElementById("root");
if (!root) throw new Error("hub: #root is missing from ui/hub/index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
