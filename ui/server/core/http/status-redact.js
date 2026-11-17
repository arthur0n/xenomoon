// The status redaction rule (#60/#92), alone in a pure file that imports nothing, so the HTTP
// handlers that apply it do not load config.js (which reads disk at import).

/** @param {unknown} payload @returns {unknown} */
function withoutLastLine(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const { lastLine: _drop, ...rest } = /** @type {Record<string, unknown>} */ (payload);
  return rest;
}

/** Any request carrying an Origin (allowed or not) gets the payload minus `lastLine`: the trusted
 * hub origin becomes config in #63; until then no cross-origin page reads conversation text.
 * "Carrying" is the header's presence, not its truthiness: node gives `Origin:` with no value as
 * `""`, and that request is redacted too. The one home of the rule for `/api/status` and its stream.
 * @param {import("node:http").IncomingHttpHeaders} headers @param {unknown} payload @returns {unknown} */
export function redactFor(headers, payload) {
  return headers.origin !== undefined ? withoutLastLine(payload) : payload;
}
