// Epic tool: the contract surface for the xeno-epic convention (a tiny wayfinder —
// see plugin/skills/xeno-epic/SKILL.md). An epic is ONE durable container for an
// effort bigger than a slice: goal, open decisions (the frontier), decisions ledger,
// fog (not-yet-specified), out-of-scope, child slices. The TOOL owns the shape and
// the writes — agents pass params, never hand-edit the body — so the ceremony stays
// deterministic. Store: a GitHub issue labelled `epic` on the project repo (raw `gh`,
// issuekit-style) when the project has an origin remote; otherwise a local
// design/epics/<slug>.md with the identical body.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { PROJECT_DIR } from "../core/config.js";

const SECTIONS = /** @type {const} */ ([
  "Goal",
  "Notes",
  "Open decisions",
  "Decisions so far",
  "Not yet specified",
  "Out of scope",
  "Slices",
]);

/** @param {string[]} args @returns {string} */
function gh(args) {
  return execFileSync("gh", args, {
    cwd: PROJECT_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** @returns {boolean} whether the project repo has an origin remote (→ GitHub store). */
function hasOrigin() {
  try {
    execFileSync("git", ["-C", PROJECT_DIR, "remote", "get-url", "origin"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Parse an epic body into its sections. Unknown leading text is kept under "".
 * @param {string} body @returns {Map<string, string[]>} */
function parse(body) {
  const map = new Map([["", /** @type {string[]} */ ([])]]);
  let cur = "";
  for (const line of body.split("\n")) {
    const h = /^## (.+)$/.exec(line);
    if (h) {
      cur = (h[1] ?? "").trim();
      if (!map.has(cur)) map.set(cur, []);
    } else {
      const arr = map.get(cur);
      if (arr) arr.push(line);
    }
  }
  return map;
}

/** @param {Map<string, string[]>} map @returns {string} */
function serialize(map) {
  const parts = [];
  const head = (map.get("") ?? []).join("\n").trim();
  if (head) parts.push(head);
  for (const s of SECTIONS) {
    const lines = (map.get(s) ?? [])
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    parts.push(`## ${s}\n\n${lines || "_none_"}`);
  }
  return parts.join("\n\n") + "\n";
}

/** Non-empty content lines of a section. @param {Map<string, string[]>} map @param {string} s */
const items = (map, s) =>
  (map.get(s) ?? []).map((l) => l.trim()).filter((l) => l && l !== "_none_");

/** Append a line to a section. @param {Map<string, string[]>} map @param {string} s @param {string} line */
function append(map, s, line) {
  map.set(s, [...items(map, s), line]);
}

/** Remove the first line containing `match` (case-insensitive). Returns whether one was removed.
 * @param {Map<string, string[]>} map @param {string} s @param {string} match */
function removeMatch(map, s, match) {
  const list = items(map, s);
  const i = list.findIndex((l) => l.toLowerCase().includes(match.toLowerCase()));
  if (i === -1) return false;
  list.splice(i, 1);
  map.set(s, list);
  return true;
}

const localDir = () => path.join(PROJECT_DIR, "design", "epics");
/** @param {string} ref @returns {{ kind: "github", num: string } | { kind: "local", file: string }} */
function resolveRef(ref) {
  const num = /^#?(\d+)$/.exec(ref.trim());
  if (num) return { kind: "github", num: num[1] ?? "" };
  return { kind: "local", file: path.join(localDir(), `${ref.trim()}.md`) };
}

/** @param {ReturnType<typeof resolveRef>} loc @returns {{ title: string, body: string }} */
function load(loc) {
  if (loc.kind === "github") {
    const raw = /** @type {unknown} */ (
      JSON.parse(gh(["issue", "view", loc.num, "--json", "title,body"]))
    );
    const j = /** @type {{ title: string, body?: string }} */ (raw);
    return { title: j.title, body: j.body ?? "" };
  }
  const text = readFileSync(loc.file, "utf8");
  const m = /^# (.*)\n?/.exec(text);
  return { title: m?.[1] ?? path.basename(loc.file, ".md"), body: text.replace(/^# .*\n?/, "") };
}

/** @param {ReturnType<typeof resolveRef>} loc @param {string} title @param {string} body */
function store(loc, title, body) {
  if (loc.kind === "github") {
    execFileSync("gh", ["issue", "edit", loc.num, "--body-file", "-"], {
      cwd: PROJECT_DIR,
      input: body,
      encoding: "utf8",
    });
  } else {
    writeFileSync(loc.file, `# ${title}\n\n${body}`);
  }
}

/** @param {string} title @param {Map<string, string[]>} map @returns {string} */
function summary(title, map) {
  const open = items(map, "Open decisions");
  const fog = items(map, "Not yet specified");
  const done = items(map, "Decisions so far").length;
  const slices = items(map, "Slices");
  return [
    `epic: ${title}`,
    `goal: ${items(map, "Goal").join(" ") || "—"}`,
    `open decisions (${open.length}):${open.length ? "\n" + open.join("\n") : " none — frontier clear"}`,
    `decided: ${done} · fog: ${fog.length} · slices: ${slices.length}`,
    fog.length ? `fog:\n${fog.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** @typedef {{ op: string, ref?: string, title?: string, goal?: string, notes?: string,
 *   question?: string, owner?: string, from_fog?: string, name?: string, answer?: string,
 *   link?: string, reason?: string }} EpicInput */

/** op:"chart" — create the epic on the picked store. @param {EpicInput} input @returns {string} */
function opChart(input) {
  const title = input.title ?? "untitled epic";
  const map = parse("");
  append(map, "Goal", input.goal ?? "—");
  if (input.notes) append(map, "Notes", input.notes);
  const body = serialize(map);
  if (hasOrigin()) {
    try {
      gh(["label", "create", "epic", "--color", "B08D57", "--description", "Xenomoon epic"]);
    } catch {
      /* label already exists */
    }
    const url = execFileSync(
      "gh",
      [
        "issue",
        "create",
        "--title",
        `Epic: ${title}`,
        "--label",
        "epic",
        "--body-file",
        "-",
        "--assignee",
        "@me",
      ],
      { cwd: PROJECT_DIR, input: body, encoding: "utf8" },
    );
    return `epic charted (github): ${url.trim()}\nUse the issue number as ref.`;
  }
  mkdirSync(localDir(), { recursive: true });
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  store({ kind: "local", file: path.join(localDir(), `${slug}.md`) }, `Epic: ${title}`, body);
  return `epic charted (local): design/epics/${slug}.md — ref "${slug}".`;
}

/** op:"list" — open epics on the active store. @returns {string} */
function opList() {
  if (hasOrigin())
    return gh(["issue", "list", "--label", "epic", "--state", "open"]).trim() || "no open epics";
  const files = existsSync(localDir())
    ? readdirSync(localDir()).filter((f) => f.endsWith(".md"))
    : [];
  return files.length
    ? files.map((f) => `- ${f.replace(/\.md$/, "")}`).join("\n")
    : "no open epics";
}

/** Mutating ops on a loaded epic. Each returns an error string, or null when the
 * mutation applied and the epic should be stored + summarized.
 * @type {Record<string, (input: EpicInput, map: Map<string, string[]>, today: string) => string | null>} */
const MUTATIONS = {
  open(input, map) {
    if (!input.question) return "open needs `question`.";
    if (input.from_fog) removeMatch(map, "Not yet specified", input.from_fog);
    append(
      map,
      "Open decisions",
      `- [ ] ${input.question}${input.owner ? ` (owner: ${input.owner})` : ""}`,
    );
    return null;
  },
  decide(input, map, today) {
    if (!input.name || !input.answer) return "decide needs `name` and `answer`.";
    removeMatch(map, "Open decisions", input.name);
    append(
      map,
      "Decisions so far",
      `- **${input.name}** — ${input.answer}${input.link ? ` ([detail](${input.link}))` : ""} (${today})`,
    );
    return null;
  },
  fog(input, map) {
    if (!input.question) return "fog needs `question`.";
    append(map, "Not yet specified", `- ${input.question}`);
    return null;
  },
  scope_out(input, map) {
    if (!input.question) return "scope_out needs `question` (the ruled-out work).";
    append(map, "Out of scope", `- ${input.question}${input.reason ? ` — ${input.reason}` : ""}`);
    return null;
  },
  slice(input, map) {
    if (!input.link) return "slice needs `link` (issue #/URL or PRD path).";
    append(map, "Slices", `- [ ] ${input.link}`);
    return null;
  },
};

export function makeEpicTool() {
  return tool(
    "epic",
    "Contract surface for xeno-epics — durable containers for efforts bigger than one " +
      "slice (goal, open decisions, decisions ledger, fog, out-of-scope, slices). The tool " +
      "owns the body shape and every write; never edit an epic by hand. Stored as a GitHub " +
      "issue labelled `epic` on the project repo when it has an origin remote, else " +
      "design/epics/<slug>.md. `ref` is the issue number (e.g. 42) or the local slug. " +
      "Route each open decision to its owning agent (see the xeno-epic skill); resolve ONE " +
      "decision per session.",
    {
      op: z
        .enum(["chart", "status", "next", "open", "decide", "fog", "scope_out", "slice", "list"])
        .describe(
          "chart: create an epic · status: full summary · next: first open decision · " +
            "open: add an open decision (optionally graduating a fog line) · decide: resolve " +
            "a decision into the ledger · fog: note a not-yet-specifiable question · " +
            "scope_out: rule work beyond the goal · slice: link a child slice · list: open epics",
        ),
      ref: z.string().optional().describe("issue number or local slug (all ops except chart/list)"),
      title: z.string().optional().describe("chart: epic title; also the local slug fallback"),
      goal: z.string().optional().describe("chart: destination, 1–2 lines — what done looks like"),
      notes: z
        .string()
        .optional()
        .describe("chart: skills/conventions/preferences for this effort"),
      question: z.string().optional().describe("open/fog: the decision or dim question"),
      owner: z
        .string()
        .optional()
        .describe("open: owning agent for the decision (e.g. product-owner)"),
      from_fog: z
        .string()
        .optional()
        .describe("open: substring of the fog line this graduates (removed)"),
      name: z
        .string()
        .optional()
        .describe("decide: short decision name (matched against open decisions)"),
      answer: z
        .string()
        .optional()
        .describe("decide: the resolution — verbatim where it is user intent"),
      link: z
        .string()
        .optional()
        .describe("decide/slice: URL or path holding the detail (PRD, issue, doc)"),
      reason: z.string().optional().describe("scope_out: why this is beyond the goal"),
    },
    async (input) => {
      /** @param {string} text */
      const ok = (text) => ({ content: [{ type: /** @type {const} */ ("text"), text }] });
      try {
        if (input.op === "chart") return ok(opChart(input));
        if (input.op === "list") return ok(opList());
        if (!input.ref) return ok(`op "${input.op}" needs a ref (issue number or local slug).`);
        const loc = resolveRef(input.ref);
        const { title, body } = load(loc);
        const map = parse(body);
        if (input.op === "status") return ok(summary(title, map));
        if (input.op === "next") {
          const open = items(map, "Open decisions");
          return ok(
            open[0]
              ? `next decision: ${open[0]}`
              : "frontier clear — no open decisions; check fog/status.",
          );
        }
        const mutation = MUTATIONS[input.op];
        if (!mutation) return ok(`unknown op "${input.op}".`);
        const err = mutation(input, map, new Date().toISOString().slice(0, 10));
        if (err) return ok(err);
        store(loc, title, serialize(map));
        return ok(summary(title, map));
      } catch (e) {
        return ok(`epic tool error: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );
}
