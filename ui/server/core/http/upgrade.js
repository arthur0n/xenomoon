// The one WebSocket door (#92, #89). Two rules, in this order: an upgrade on any path but `/`
// (the page's `ws://<host>` and its `?resume=<id>` variant) is refused with 400; an upgrade
// with a foreign Host or Origin (`requestRefusal`, cors.js) is refused with 403. A refused
// upgrade never reaches `wss.handleUpgrade`, so it can neither open nor re-attach a session.

import { requestRefusal } from "./cors.js";

/** Answer a refused upgrade on the raw socket and close it.
 * @param {import("node:stream").Duplex} socket @param {string} status e.g. "400 Bad Request" */
function refuse(socket, status) {
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/** Hand a `/` upgrade from a local page to `wss` (which emits `connection`); refuse every other
 * path with 400 and a foreign Host or Origin with 403.
 * `wss` must be built with `{ noServer: true }`, or it would also take every upgrade itself.
 * @param {import("node:http").Server} server
 * @param {import("ws").WebSocketServer} wss */
export function attachSessionUpgrade(server, wss) {
  server.on("upgrade", (req, socket, head) => {
    const url = req.url ?? "";
    const q = url.indexOf("?");
    const pathname = q === -1 ? url : url.slice(0, q);
    if (pathname !== "/") {
      refuse(socket, "400 Bad Request");
      return;
    }
    if (requestRefusal(req.headers) !== null) {
      refuse(socket, "403 Forbidden");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });
}
