// The contract's "How far" line, read from an issue body, and the one check Publish needs:
// may this change be merged, or deployed? Pure: no gh, no git, no file access. The caller
// fetches the body and decides whether an issue with no line is checked at all.
// Contract shape: plugin/docs/flow/contract.md. Publish step: plugin/docs/flow/publish.md.

/** @typedef {"pr" | "merged" | "deployed"} HowFarValue */
/** @typedef {HowFarValue | "none" | "unclear"} HowFar */
/** @typedef {"merge" | "deploy"} HowFarMove */

/** Value → the contract's own words, for receipts, so no caller retypes them. */
export const HOW_FAR_LABELS = Object.freeze(
  /** @type {Record<HowFarValue, string>} */ ({
    pr: "pull request opened",
    merged: "merged",
    deployed: "deployed",
  }),
);

/** @type {Record<string, HowFarValue>} */
const VALUE_WORDS = {
  "pull request opened": "pr",
  "pr opened": "pr",
  "pull request": "pr",
  pr: "pr",
  merged: "merged",
  deployed: "deployed",
};

/** Which values allow which move. */
/** @type {Record<HowFarMove, readonly string[]>} */
const ALLOWED_BY = { merge: ["merged", "deployed"], deploy: ["deployed"] };

// Optional bullet, optional bold around the label (colon inside or outside it), label, colon.
const LABEL_LINE = /^\s*(?:[-*]\s+)?(?:\*\*)?\s*how\s+far\s*(?:\*\*)?\s*:\s*(?:\*\*)?(.*)$/i;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * The fence state after one line: an opening marker opens, a marker of the same char and at
 * least the same length closes.
 * @param {string} line
 * @param {string} open the open fence marker, "" when outside a fence
 * @returns {string}
 */
function nextFence(line, open) {
  const m = FENCE.exec(line);
  if (!m) return open;
  const marker = m[1] ?? "";
  if (!open) return marker;
  const closes = marker[0] === open[0] && marker.length >= open.length;
  return closes && line.trim() === marker ? "" : open;
}

/**
 * The raw value text of every readable "How far:" line, outside fenced code blocks.
 * @param {string} body
 * @returns {string[]}
 */
function labelValues(body) {
  /** @type {string[]} */
  const values = [];
  let open = "";
  for (const line of body.split(/\r?\n/)) {
    const wasOpen = open;
    open = nextFence(line, open);
    if (wasOpen || open) continue;
    const m = LABEL_LINE.exec(line);
    if (m) values.push(m[1] ?? "");
  }
  return values;
}

/**
 * One raw value → its meaning: the text up to the first comma, bold and backticks stripped.
 * @param {string} raw
 * @returns {HowFarValue | "unclear"}
 */
function valueOf(raw) {
  const text = (raw.split(",")[0] ?? "")
    .replace(/\*\*|`/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return VALUE_WORDS[text] ?? "unclear";
}

/**
 * Read the "How far" line of an issue body. Lines inside a fenced code block (``` or ~~~)
 * are NOT read, even when the contract template itself is pasted as a fenced block: a
 * contract written that way reads as "none". Two or more readable lines must agree.
 * @param {unknown} body
 * @returns {HowFar} "none" when no readable line; "unclear" for an unknown value (the
 *   untouched template included) or lines that disagree.
 */
export function readHowFar(body) {
  if (typeof body !== "string") return "none";
  const values = labelValues(body).map(valueOf);
  const first = values[0];
  if (first === undefined) return "none";
  return values.every((v) => v === first) ? first : "unclear";
}

/**
 * What the line says, for the stop sentence.
 * @param {string} howFar
 * @returns {string}
 */
function lineSays(howFar) {
  if (howFar === "none") return 'has no "How far" line';
  const label = HOW_FAR_LABELS[/** @type {HowFarValue} */ (howFar)];
  if (label) return `has "How far: ${label}"`;
  return 'has a "How far" line that cannot be read (an unknown value, or lines that disagree)';
}

/**
 * May this move happen under the issue's "How far" line?
 * @param {HowFar} howFar from readHowFar
 * @param {HowFarMove} move
 * @param {number | string} issue the issue number, with or without "#"
 * @returns {string} "" when allowed, else one plain sentence that stops the move
 */
export function howFarStop(howFar, move, issue) {
  const allowed = ALLOWED_BY[move] ?? [];
  if (allowed.includes(howFar)) return "";
  const ref = `#${String(issue).replace(/^#/, "")}`;
  return (
    `Issue ${ref} ${lineSays(howFar)}, so ${move} is past what the owner allowed: ` +
    `the issue stays at state Ready, not published, and only the owner changes the "How far" line.`
  );
}
