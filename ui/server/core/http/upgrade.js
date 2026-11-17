// The one WebSocket door (#92). The session socket lives at pathname `/` only (the page's
// `ws://<host>` and its `?resume=<id>` variant); an upgrade on any other path, such as
// `/api/status/stream`, is refused with 400 and never reaches `handleConnection`, so it can
// neither open nor re-attach a session.

/** Hand a `/` upgrade to `wss` (which emits `connection`); refuse every other path with 400.
 * `wss` must be built with `{ noServer: true }`, or it would also take every upgrade itself.
 * @param {import("node:http").Server} server
 * @param {import("ws").WebSocketServer} wss */
export function attachSessionUpgrade(server, wss) {
  server.on("upgrade", (req, socket, head) => {
    const url = req.url ?? "";
    const q = url.indexOf("?");
    const pathname = q === -1 ? url : url.slice(0, q);
    if (pathname !== "/") {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });
}
