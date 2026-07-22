// Aggregate token usage from session NDJSON logs.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../../lib/json.js";
import { readPromotions } from "../../features/promotions/promotions-store.js";
import { LOG_DIR } from "../config.js";

/**
 * The denominator of the efficiency metric: a promotion the human ACCEPTED —
 * `approved` (decided, files not yet moved) or `promoted` (moved into the plugin).
 * `requested` is undecided and `rejected` is a refusal, so neither counts.
 *
 * Promotions are the only DURABLE record of an accepted change on disk. Completed
 * agent tasks look like a denser denominator but are not one: `pruneDoneTasks`
 * deletes every `owner:"agent"` + `done` task at each turn boundary (tasks-store.js,
 * called from session.js), so a count of them measures the current turn, not history.
 */
const ACCEPTED_STATUSES = new Set(["approved", "promoted"]);

/** How many of the heaviest sessions the tokens tab lists — enough to spot an outlier
 * run without turning the panel into a full log index. */
const TOP_SESSIONS = 10;

/** @typedef {{ input_tokens?: number, output_tokens?: number, cache_creation_input_tokens?: number, cache_read_input_tokens?: number }} TokenUsage */
/** @typedef {{ message?: { usage?: TokenUsage, total_cost_usd?: number } }} LogLine */

/**
 * Aggregate one session's NDJSON log. `message.usage` here matches the SDK
 * `result` event's top-level cumulative-per-turn usage (assistant-event usage
 * lives deeper at message.message.usage and isn't picked up), so summing across
 * lines yields the session total without double counting. `total_cost_usd` is
 * the SDK's own per-turn cost estimate.
 * @param {string} file
 * @returns {{ input: number, output: number, cacheCreate: number, cacheRead: number, cost: number }}
 */
function parseSession(file) {
  let input = 0,
    output = 0,
    cacheCreate = 0,
    cacheRead = 0,
    cost = 0;
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line) continue;
      try {
        const obj = /** @type {LogLine} */ (parseJSON(line));
        cost += obj.message?.total_cost_usd ?? 0;
        const u = obj.message?.usage;
        if (!u) continue;
        input += u.input_tokens ?? 0;
        output += u.output_tokens ?? 0;
        cacheCreate += u.cache_creation_input_tokens ?? 0;
        cacheRead += u.cache_read_input_tokens ?? 0;
      } catch {}
    }
  } catch {}
  return { input, output, cacheCreate, cacheRead, cost };
}

/** How many changes the human has accepted, across all sessions. @returns {number} */
function acceptedChanges() {
  return readPromotions().filter((p) => ACCEPTED_STATUSES.has(p.status)).length;
}

/**
 * @returns {{
 *   sessionCount: number,
 *   totalCount: number,
 *   totals: { input: number, output: number, cacheCreate: number, cacheRead: number, cost: number },
 *   hitRate: number,
 *   accepted: number,
 *   costPerAcceptedChange: number | null,
 *   tokensPerAcceptedChange: number | null,
 *   topSessions: { name: string, input: number, output: number, cacheCreate: number, cacheRead: number, cost: number, total: number }[]
 * }}
 */
export function computeUsage() {
  /** @type {string[]} */
  let files;
  try {
    files = readdirSync(LOG_DIR).filter((f) => f.endsWith(".ndjson"));
  } catch {
    return {
      sessionCount: 0,
      totalCount: 0,
      totals: { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, cost: 0 },
      hitRate: 0,
      accepted: acceptedChanges(),
      costPerAcceptedChange: null,
      tokensPerAcceptedChange: null,
      topSessions: [],
    };
  }

  /** @type {{ name: string, input: number, output: number, cacheCreate: number, cacheRead: number, cost: number, total: number }[]} */
  const sessions = [];
  for (const f of files) {
    const s = parseSession(path.join(LOG_DIR, f));
    const total = s.input + s.output + s.cacheCreate + s.cacheRead;
    if (total > 0) {
      sessions.push({ name: f.replace(/^session-/, "").replace(/\.ndjson$/, ""), ...s, total });
    }
  }

  const totals = sessions.reduce(
    (acc, s) => ({
      input: acc.input + s.input,
      output: acc.output + s.output,
      cacheCreate: acc.cacheCreate + s.cacheCreate,
      cacheRead: acc.cacheRead + s.cacheRead,
      cost: acc.cost + s.cost,
    }),
    { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, cost: 0 },
  );

  const hitRate =
    totals.cacheCreate + totals.cacheRead > 0
      ? Math.round((100 * totals.cacheRead) / (totals.cacheRead + totals.cacheCreate))
      : 0;

  sessions.sort((a, b) => b.total - a.total);

  // The efficiency metric the framework steers by: spend divided by what the human
  // actually took. Total tokens alone can only be driven down by doing less work;
  // this ratio only improves by turning spend into accepted changes. Both are null
  // with nothing accepted yet — a ratio over a zero denominator is not "infinitely
  // expensive", it is unmeasured, and the UI must say so rather than print ∞.
  const accepted = acceptedChanges();
  const spentTokens = totals.input + totals.output + totals.cacheCreate + totals.cacheRead;

  return {
    sessionCount: sessions.length,
    totalCount: files.length,
    totals,
    hitRate,
    accepted,
    costPerAcceptedChange: accepted > 0 ? totals.cost / accepted : null,
    tokensPerAcceptedChange: accepted > 0 ? spentTokens / accepted : null,
    topSessions: sessions.slice(0, TOP_SESSIONS),
  };
}
