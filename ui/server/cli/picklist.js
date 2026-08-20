// A numbered picklist for the terminal questionnaire.
//
// Numbered rather than arrow-key: raw-mode selection needs a TTY, and the installer must work
// piped, in CI, and over ssh. A number also survives being read aloud or pasted into an issue.
//
// The recommended option is always FIRST and is what empty selects — so the ordering is the
// recommendation, and callers order by what they found in the project rather than by taste.

/** @typedef {{ id: string, summary: string, detail?: string }} PickItem */

/** The block to print above the question.
 * @param {{ title: string, items: PickItem[], warning?: string[], note?: string[] }} opts
 * @returns {string} */
export function render({ title, items, warning = [], note = [] }) {
  const width = Math.max(...items.map((i) => i.id.length));
  const lines = [
    title,
    "",
    ...items.flatMap((item, i) => {
      const rows = [`  ${i + 1}) ${item.id.padEnd(width)}  ${item.summary}`];
      if (item.detail) rows.push(`     ${" ".repeat(width)}  ${item.detail}`);
      return rows;
    }),
  ];
  if (warning.length > 0) lines.push("", ...warning.map((w) => `  ⚠ ${w}`));
  if (note.length > 0) lines.push("", ...note.map((n) => `  ${n}`));
  lines.push("");
  return lines.join("\n");
}

/** The id an answer selects — a number, an id, or empty for the first (recommended) one.
 * Anything else returns null so the caller can say what was wrong instead of guessing: a
 * typo must never silently select the default, which is how someone ends up installed
 * against a domain they did not choose.
 * @param {string} answer @param {PickItem[]} items @returns {string | null} */
export function choose(answer, items) {
  const a = answer.trim().toLowerCase();
  if (!a) return items[0]?.id ?? null;
  if (/^\d+$/.test(a)) return items[Number(a) - 1]?.id ?? null;
  return items.find((i) => i.id.toLowerCase() === a)?.id ?? null;
}

/** The one-line hint that follows the list, naming what empty picks.
 * @param {string} label @param {PickItem[]} items @returns {string} */
export const question = (label, items) => `${label} [empty = ${items[0]?.id ?? "?"}]: `;
