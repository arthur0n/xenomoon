// The ONE origin rule for cross-origin reads (#60): a browser page served by another local
// install (http://localhost:<port> or http://127.0.0.1:<port>) may read this server's status.
// Pure, no state. Node's WHATWG URL drops a default port (`:80` → port "") and moves anything
// before `@` into username/password, so the checks below reject `http://localhost:3117@evil`.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** The request's Origin header echoed back when it names a local http install, else null.
 * The input must equal the parsed URL's `origin` exactly (no path, no trailing slash).
 * @param {string | undefined} origin @returns {string | null} */
export function corsOrigin(origin) {
  if (!origin || !URL.canParse(origin)) return null;
  const url = new URL(origin);
  const local =
    url.protocol === "http:" &&
    LOCAL_HOSTS.has(url.hostname) &&
    url.port !== "" &&
    !url.username &&
    !url.password &&
    origin === url.origin;
  return local ? origin : null;
}
