/** Shell-quoting for commands we PRINT rather than run.
 *
 * Anything that hands someone a command to paste — a prompt block, a doctor row, a hook's deny
 * message — is handing over something that has to survive the path it names. Install roots contain
 * spaces often enough (`/Users/me/Code/My Project/…`) that an unquoted path turns advice into a
 * command that runs the wrong thing or nothing, and it does so exactly when the reader is already
 * stuck. Every such site quotes through here so none of them has to remember.
 */

/** Wrap a value in single quotes for a POSIX shell, escaping any single quotes inside it.
 * @param {string} s @returns {string} */
export function shq(s) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
