// POC web UI server for the Godot agent workflow. Bridges a browser
// (WebSocket) to a Claude Code session (Agent SDK).
//
// Usage: node ui/server/index.js /path/to/your/godot/project
//
// Requires Claude Code installed and authenticated on this machine — the SDK
// drives the same local Claude Code the terminal uses.
import http from "node:http";
import { mkdirSync } from "node:fs";
import { WebSocketServer } from "ws";
import { PORT, PROJECT_DIR, LOG_DIR } from "./config.js";
import { projectState } from "./project-state.js";
import { recentSessions } from "./transcripts.js";
import { serveStatic } from "./static.js";
import { handleConnection } from "./session.js";

mkdirSync(LOG_DIR, { recursive: true });

const server = http.createServer((req, res) => {
  if (req.url === "/api/state") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(projectState()));
    return;
  }
  if (req.url === "/api/sessions") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(recentSessions()));
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server });
wss.on("connection", handleConnection);

server.listen(PORT, () => {
  console.log(`UI on http://localhost:${PORT} — project: ${PROJECT_DIR}`);
});
