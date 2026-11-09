// Pre-write checks of the records CLI (#73): what a command is about to write must read back as
// what it meant to write (the frontmatter subset has no quoting), and the library it would leave
// behind must pass the cross-record link check. Pure over text + one library read; no writes.
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { formatValue, parseFrontmatter } from "../../../lib/frontmatter.js";
import { linkProblems, toRecord } from "../../../lib/records.js";
import { readLibrary } from "./library-io.js";

/**
 * Each field of `want` that does not parse back from `text` unchanged, as a problem line.
 * `exact` also reports a key the text holds that `want` does not (a newline smuggled a key in).
 * @param {string} text  the complete record text about to be written
 * @param {import("../../../lib/frontmatter.js").FrontmatterData} want
 * @param {{ exact?: boolean }} [o]
 * @returns {string[]}
 */
export function roundTripProblems(text, want, { exact = false } = {}) {
  const data = parseFrontmatter(text).data ?? {};
  const keys = exact
    ? [...new Set([...Object.keys(want), ...Object.keys(data)])]
    : Object.keys(want);
  return keys
    .filter((k) => !isDeepStrictEqual(data[k], want[k]))
    .map((k) => {
      const v = want[k];
      return `\`${k}\` cannot be written as frontmatter: ${v === undefined ? "(not set)" : typeof v === "string" ? v : formatValue(v)}`;
    });
}

/**
 * Link problems of the library at `root` as it would be after the writes: every record read from
 * disk, each written file's record replaced by (or added as) its new text.
 * @param {string} root
 * @param {{ file: string, text: string }[]} writes  record files under `root/<kind>/<slug>.md`
 * @returns {string[]}
 */
export function prospectiveLinkProblems(root, writes) {
  /** @type {Map<string, import("../../../lib/records.js").LibRecord>} */
  const byFile = new Map();
  for (const kd of readLibrary(root, { strict: false }))
    for (const r of kd.records) byFile.set(path.join(kd.dir, `${r.slug}.md`), r);
  for (const w of writes) {
    const folder = path.basename(path.dirname(w.file));
    const data = parseFrontmatter(w.text).data ?? {};
    byFile.set(w.file, toRecord(path.basename(w.file, ".md"), folder, data));
  }
  return linkProblems([...byFile.values()]);
}
