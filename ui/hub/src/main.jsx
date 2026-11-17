// Hub page entry: one hub client for the page, and <App /> mounted into #root of ui/hub/index.html.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { makeHubApi } from "./hub-api.js";

const root = document.getElementById("root");
if (!root) throw new Error("hub: #root is missing from ui/hub/index.html");

createRoot(root).render(
  <StrictMode>
    <App api={makeHubApi()} />
  </StrictMode>,
);
