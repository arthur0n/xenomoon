// THE port rule (#65, #97), pure and import-free so both the server and the hub page use it:
// a port is an integer from 1 to 65535.

/** The highest TCP port number. */
export const MAX_PORT = 65535;

/** True for every project port accepted or validated (install file, --port, the commit-time
 * check in ui/server/cli/project-entry.js, an inherited PORT, the hub row address).
 * @param {unknown} v @returns {v is number} */
export const isPort = (v) =>
  Number.isInteger(v) && /** @type {number} */ (v) >= 1 && /** @type {number} */ (v) <= MAX_PORT;
