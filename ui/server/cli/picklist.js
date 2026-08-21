// A picklist for the terminal questionnaire — arrow-key selection on a real TTY, the numbered
// list everywhere else.
//
// Both modes exist on purpose: raw-mode selection needs a TTY, and the installer must also work
// piped, in CI, and over ssh — there the numbered form stays, and a number survives being read
// aloud or pasted into an issue. On a TTY, ↑/↓ (or j/k) move, Enter picks, and a digit still
// jump-picks, so the muscle memory from either mode works in the other.
//
// The recommended option is always FIRST and is what empty (or the initial Enter) selects — so
// the ordering is the recommendation, and callers order by what they found in the project rather
// than by taste.

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

// ── interactive selection ────────────────────────────────────────────────────

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

/** The list block with one row highlighted — same layout as render()'s numbered rows, so the
 * arrow view and the piped view read as the same question.
 * @param {PickItem[]} items @param {number} sel @returns {string[]} */
function highlightRows(items, sel) {
  const width = Math.max(...items.map((i) => i.id.length));
  return items.flatMap((item, i) => {
    const on = i === sel;
    const head = on
      ? `${CYAN}${BOLD}❯ ${i + 1}) ${item.id.padEnd(width)}  ${item.summary}${RESET}`
      : `${DIM}  ${i + 1}) ${item.id.padEnd(width)}  ${item.summary}${RESET}`;
    const rows = [head];
    if (item.detail) rows.push(`${DIM}     ${" ".repeat(width)}  ${item.detail}${RESET}`);
    return rows;
  });
}

/**
 * Ask a picklist question. On a real TTY: arrow-key selection (↑/↓ or j/k move, Enter picks the
 * highlighted row, a digit jump-picks, Esc/Ctrl-C aborts the install). Anywhere else — piped,
 * CI, a dumb terminal — the numbered render() + readline flow, unchanged. Always returns a
 * valid id in arrow mode; in the fallback the caller still gets null for a typo and says what
 * was wrong, exactly as before.
 * @param {{ question: (q: string) => Promise<string>, pause?: () => void, resume?: () => void }} rl
 * @param {{ title: string, items: PickItem[], warning?: string[], note?: string[], label: string }} opts
 * @returns {Promise<{ id: string | null, answer: string }>} */
export async function pickList(rl, { title, items, warning = [], note = [], label }) {
  const stdin = process.stdin;
  const stdout = process.stdout;
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
    stdout.write(render({ title, items, warning, note }) + "\n");
    const answer = await rl.question(question(label, items));
    return { id: choose(answer, items), answer };
  }

  // Header once (title + warnings + notes), then the item rows get redrawn per keypress.
  const header = [title, ""];
  if (warning.length > 0) header.push(...warning.map((w) => `  ⚠ ${w}`), "");
  if (note.length > 0) header.push(...note.map((n) => `  ${n}`), "");
  stdout.write(header.join("\n") + "\n");
  const rowCount = highlightRows(items, 0).length + 1; // + the key-hint line

  /** @param {number} sel @param {boolean} first */
  const draw = (sel, first) => {
    if (!first) stdout.write(`\x1b[${rowCount}A`); // back to the top of the block
    const rows = [
      ...highlightRows(items, sel),
      `${DIM}  ↑/↓ move · Enter picks · 1-${items.length} jumps · Esc aborts${RESET}`,
    ];
    stdout.write(rows.map((r) => `\x1b[2K${r}`).join("\n") + "\n");
  };

  rl.pause?.();
  stdin.setRawMode(true);
  stdin.resume();
  let sel = 0;
  draw(sel, true);

  const id = await /** @type {Promise<string | null>} */ (
    new Promise((resolve) => {
      /** @param {Buffer} b */
      const onKey = (b) => {
        const k = b.toString();
        if (k === "\x1b[A" || k === "k") sel = (sel - 1 + items.length) % items.length;
        else if (k === "\x1b[B" || k === "j") sel = (sel + 1) % items.length;
        else if (k === "\r" || k === "\n") {
          done(items[sel]?.id ?? null);
          return;
        } else if (/^[1-9]$/.test(k) && Number(k) <= items.length) {
          sel = Number(k) - 1;
          done(items[sel]?.id ?? null);
          return;
        } else if (k === "\x1b" || k === "\x03") {
          // Esc / Ctrl-C: abort the whole install, visibly — a picker must never swallow a ^C.
          cleanup();
          stdout.write("\naborted.\n");
          process.exit(130);
        } else return; // anything else: ignore
        draw(sel, false);
      };
      const cleanup = () => {
        stdin.off("data", onKey);
        stdin.setRawMode(false);
        stdin.pause();
        rl.resume?.();
      };
      /** @param {string | null} picked */
      const done = (picked) => {
        cleanup();
        resolve(picked);
      };
      stdin.on("data", onKey);
    })
  );

  stdout.write(`${label}: ${BOLD}${id}${RESET}\n`);
  return { id, answer: id ?? "" };
}
