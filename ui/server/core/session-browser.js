// The browser a session drives, as SDK CLI flags. Pure: it takes the baked descriptor's `browser`
// value (DomainDescriptor in domain-resolver.js) and never reads config.js, so a test can call it
// with a hand-built value. "chrome" turns on the `--chrome` CLI flag (the SDK's `extraArgs`,
// `null` = boolean flag), which connects the claude-in-chrome tool server; anything else adds
// no flag, so the session starts exactly as it would without the option.

/** @param {unknown} browser the descriptor's `browser` value ("chrome" or absent)
 * @returns {Record<string, string | null>} the SDK `extraArgs` option */
export function browserExtraArgs(browser) {
  return browser === "chrome" ? { chrome: null } : {};
}
