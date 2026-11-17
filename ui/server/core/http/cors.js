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

/** Whether a Host header names this machine: exactly `localhost` or `127.0.0.1`, with or without
 * a port (#92, DNS rebinding: a re-pointed foreign name still sends its own Host). The value must
 * equal the parsed URL's `host`, or that `host` plus `:80` (the URL parser drops the default port,
 * so `localhost:80` parses to `localhost`); userinfo, a path, `127.1` and upper case are refused.
 * @param {string | undefined} host @returns {boolean} */
export function isLocalHost(host) {
  if (!host || !URL.canParse(`http://${host}`)) return false;
  const url = new URL(`http://${host}`);
  return LOCAL_HOSTS.has(url.hostname) && (url.host === host || `${url.host}:80` === host);
}
