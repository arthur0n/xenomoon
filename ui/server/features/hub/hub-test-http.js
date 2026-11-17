// Test support for the hub server tests, not a test file itself: one bounded GET against a port.
import http from "node:http";
import { withDeadline } from "../../core/http/test-deadline.js";

/** One GET; resolves with the status and the body (an event stream: its first chunk).
 * @param {number} port @param {string} path @param {Record<string, string>} headers
 * @returns {Promise<{ status: number | undefined, text: string }>} */
export function ask(port, path, headers) {
  /** @type {import("node:http").ClientRequest | undefined} */
  let req;
  return withDeadline(
    `GET ${path}`,
    (resolve, reject) => {
      req = http.get({ host: "127.0.0.1", port, path, agent: false, headers }, (res) => {
        let text = "";
        const done = () => {
          resolve({ status: res.statusCode, text });
          req?.destroy();
        };
        res.setEncoding("utf8");
        res.on("data", (/** @type {string} */ c) => {
          text += c;
          if (res.headers["content-type"] === "text/event-stream") done();
        });
        res.on("end", done);
      });
      req.on("error", reject);
    },
    () => req?.destroy(),
  );
}
