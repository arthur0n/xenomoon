// Skill-scope registry CORE — the read + inversion logic shared by the CLI validator
// (cli/gen-skill-scope.js), the set_skill MCP tool, and the recalibration UI. The per-skill `agents:`
// tag in each plugin/skills/*/SKILL.md is the source of truth; it inverts to a per-agent skill set
// (projected into agent frontmatter). Deliberately free of config.js (whose import triggers a
// load-time domain/engine probe) so it stays loadable under `npm run validate`. Paths resolve from
// this file's location.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)); // ui/server/features/skills
const ROOT = path.join(HERE, "..", "..", "..", "..");
const PLUGIN = path.join(ROOT, "plugin");
export const SKILLS_DIR = path.join(PLUGIN, "skills");
export const AGENTS_DIR = path.join(PLUGIN, "agents");

/** Sentinel for the main session (the hive) in audience sets — NOT an agent file. Its tag token is
 * `orchestrator`; its skill set is ORCHESTRATOR_FRAMEWORK_SKILLS (in skill-catalog.js). */
export const ORCH = "@orchestrator";

/** Where the `builders` cohort came from. The DISTINCTION matters to callers: "a domain answered,
 * and its answer is none" is a decidable state, while "no domain answered at all" is not — and a
 * check that conflates them either fails an unbound trunk or lets a bound zero-builder pack ship
 * agents preloading skills outside their audience.
 * A descriptor that exists but cannot be READ is `invalid` — a broken explicit choice, which must
 * be loud rather than quietly join the tolerated state.
 * @typedef {"baked" | "env" | "unbound" | "invalid"} BuildersSource */

/** Resolve the `builders` audience token — the ACTIVE domain's code-writers. CORE ships no builder
 * of its own: each pack declares its cohort in its `domain.json`, which `forge new` bakes into
 * `.xenomoon.json`'s `domainDescriptor`.
 *
 * The baked descriptor wins. Failing that, an explicitly named domain is read from the catalog: a
 * clean clone has no binding, which is how CI runs this gate, and CI pins XENOMOON_DOMAIN for
 * exactly that reason ("the gate pins one explicitly"). config.js already honoured that env var;
 * this module did not, so the token expanded to nobody and every CORE agent listing a
 * `builders`-tagged skill was reported as drift.
 *
 * Plain `fs` throughout, never `config.js` — importing that triggers a load-time domain/engine probe
 * and this module must stay loadable under `npm run validate`. Taking root and env as arguments also
 * makes the resolution testable against a fixture instead of only the real tree.
 * @param {string} root @param {Record<string, string | undefined>} env
 * @returns {{ builders: string[], source: BuildersSource }} */
export function resolveBuilders(root, env) {
  /** @param {unknown} d */
  const list = (d) => (Array.isArray(d) ? d.filter((x) => typeof x === "string") : []);
  /** Read one descriptor. A file that EXISTS but cannot be read is `invalid`, never absent: it was
   * somebody's explicit choice, and reporting it as "no domain" would hand the caller the one state
   * that gets tolerated. @param {string} file @param {(v: unknown) => unknown} pick */
  const read = (file, pick) => {
    if (!existsSync(file)) return { found: false, invalid: false, builders: [] };
    try {
      const parsed = /** @type {unknown} */ (JSON.parse(readFileSync(file, "utf8")));
      const b = pick(parsed);
      // An `undefined` value is no answer; a declared list IS one, even when it is empty.
      return b === undefined
        ? { found: false, invalid: false, builders: [] }
        : { found: true, invalid: false, builders: list(b) };
    } catch {
      return { found: false, invalid: true, builders: [] };
    }
  };

  const baked = read(path.join(root, ".xenomoon.json"), (v) => {
    const cfg = /** @type {{ domainDescriptor?: { builders?: unknown } }} */ (v);
    return cfg.domainDescriptor?.builders;
  });
  if (baked.found) return { builders: baked.builders, source: "baked" };
  if (baked.invalid) return { builders: [], source: "invalid" };

  // An env request is EXPLICIT. A typo or a stale CI setting must not read as "no domain selected" —
  // that is the one state this gate tolerates, so an unresolvable request would let a misconfigured
  // run go green without ever checking the domain it was asked to check.
  const name = env.XENOMOON_DOMAIN;
  if (name) {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) return { builders: [], source: "invalid" };
    const located = packDescriptor(root, name);
    if (located.conflicted || !located.file) return { builders: [], source: "invalid" };
    // A named pack that parses HAS answered, even if it declares no cohort — unlike the baked
    // descriptor, where a missing `builders` key is an older binding that should fall through to
    // the env request rather than assert "no builders".
    const pack = read(located.file, (v) => {
      const d = /** @type {{ builders?: unknown }} */ (v);
      return d.builders ?? [];
    });
    return pack.invalid
      ? { builders: [], source: "invalid" }
      : { builders: pack.builders, source: "env" };
  }
  return { builders: [], source: "unbound" };
}

/** The `domain.json` a domain NAME refers to, honouring renames — mirroring `resolvePackDir` in
 * domain-resolver.js, which is the authority. A pack carries its own history as `formerNames`, so
 * looking only at `domains/<name>/` reports a renamed-but-valid pack as no domain at all, and this
 * gate tolerates "no domain".
 *
 * CLAIMS ARE INDEXED FIRST, exactly as the real resolver does, so the answer never depends on
 * readdir order and both authoring conflicts are refused rather than silently resolved: two packs
 * claiming one former name, and a former name that is ALSO a live directory (where a clone keeps
 * loading the old pack until the day that directory is deleted, then switches without warning).
 * Preferring the direct hit would let this gate pass a catalog the runtime resolver throws on.
 * @param {string} root @param {string} name
 * @returns {{ file: string | null, conflicted: boolean }} */
function packDescriptor(root, name) {
  const domainsDir = path.join(root, "domains");
  /** @type {string[]} */
  let dirs;
  try {
    dirs = readdirSync(domainsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(path.join(domainsDir, e.name, "domain.json")))
      .map((e) => e.name);
  } catch {
    return { file: null, conflicted: false }; // no domains/ catalog at all
  }
  const live = new Set(dirs);
  /** @type {Map<string, string[]>} */
  const claims = new Map();
  for (const dir of dirs) {
    try {
      const parsed = /** @type {unknown} */ (
        JSON.parse(readFileSync(path.join(domainsDir, dir, "domain.json"), "utf8"))
      );
      const raw = /** @type {{ formerNames?: unknown }} */ (parsed);
      const former = Array.isArray(raw.formerNames) ? raw.formerNames : [];
      for (const old of former)
        if (typeof old === "string" && old) claims.set(old, [...(claims.get(old) ?? []), dir]);
    } catch {
      /* a pack whose descriptor cannot be parsed cannot claim a name */
    }
  }
  for (const [old, claimants] of claims)
    if (claimants.length > 1 || live.has(old)) return { file: null, conflicted: true };

  const dir = live.has(name) ? name : claims.get(name)?.[0];
  return {
    file: dir ? path.join(domainsDir, dir, "domain.json") : null,
    conflicted: false,
  };
}

const RESOLVED_BUILDERS = resolveBuilders(ROOT, process.env);
/** The active domain's code-writers, or empty when no domain answered. @type {string[]} */
export const BUILDERS = RESOLVED_BUILDERS.builders;
/** How BUILDERS was resolved — see the typedef for why callers need to know.
 * @type {BuildersSource} */
export const BUILDERS_SOURCE = RESOLVED_BUILDERS.source;

/** The frontmatter block (between the first two `---`) and the body that follows.
 * @param {string} text @returns {{ fm: string, body: string }} */
export function split(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return m ? { fm: m[1] ?? "", body: m[2] ?? "" } : { fm: "", body: text };
}

/** Parse a `skills:` value from a frontmatter string. Handles both YAML forms an agent may use:
 * the block form (`  - name` items on following lines) AND the inline form (`skills: a, b` or
 * `skills: [a, b]` on the same line — e.g. tester/uat-runner). Returning [] for the inline form
 * (the old behavior) silently dropped those agents' skills once they lived in the single tree.
 * @param {string} fm @returns {string[]} */
export function parseSkillsList(fm) {
  const lines = fm.split("\n");
  const start = lines.findIndex((l) => /^skills:/.test(l));
  if (start < 0) return [];
  // Inline form: a value on the `skills:` line itself (comma/space list, optional flow brackets).
  const inline = (lines[start] ?? "").match(/^skills:\s*(\S.*?)\s*$/);
  if (inline?.[1])
    return inline[1]
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  /** @type {string[]} */
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const item = line.match(/^\s*-\s*(.+?)\s*$/);
    if (item?.[1]) out.push(item[1]);
    else if (/^\S/.test(line)) break; // next top-level key
  }
  return out;
}

/** Discover skills: { dir-name -> agents tag tokens }. @returns {Map<string,string[]>} */
export function readSkills() {
  /** @type {Map<string, string[]>} */
  const skills = new Map();
  for (const e of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const file = path.join(SKILLS_DIR, e.name, "SKILL.md");
    if (!existsSync(file)) continue;
    const { fm } = split(readFileSync(file, "utf8"));
    const tag = fm.match(/^agents:\s*\[([^\]]*)\]/m);
    skills.set(
      e.name,
      tag?.[1]
        ? tag[1]
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    );
  }
  return skills;
}

/** Discover agents: { name -> { skills, tools, model, body } }.
 * @returns {Map<string,{skills:string[],tools:string[],model:string|null,body:string}>} */
export function readAgents() {
  /** @type {Map<string, {skills:string[],tools:string[],model:string|null,body:string}>} */
  const agents = new Map();
  for (const f of readdirSync(AGENTS_DIR)) {
    if (!f.endsWith(".md")) continue;
    const { fm, body } = split(readFileSync(path.join(AGENTS_DIR, f), "utf8"));
    const tools = (fm.match(/^tools:\s*(.+)$/m)?.[1] ?? "").split(",").map((s) => s.trim());
    const model = fm.match(/^model:\s*(\S+)/m)?.[1] ?? null;
    agents.set(f.replace(/\.md$/, ""), { skills: parseSkillsList(fm), tools, model, body });
  }
  return agents;
}

/** Expand one audience token into agent ids (or the ORCH sentinel). Unknown tokens push to `errors`
 * if supplied (the CLI gates on them; the tool/UI ignores them).
 * @param {string} token @param {string[]} agentNames @param {string[]} workers @param {string[]} [errors]
 * @returns {string[]} */
export function expandToken(token, agentNames, workers, errors) {
  if (token === "all") return [ORCH, ...agentNames];
  if (token === "subagents") return [...agentNames]; // every agent, NOT the ORCH sentinel
  if (token === "workers") return workers;
  if (token === "builders") return BUILDERS;
  if (token === "orchestrator") return [ORCH];
  if (agentNames.includes(token)) return [token];
  errors?.push(`unknown audience token \`${token}\` (not a reserved token or an agent name)`);
  return [];
}

/** Invert the skill tags into the expected per-audience skill sets.
 * @param {Map<string,string[]>} skills @param {string[]} agentNames @param {string[]} workers
 * @param {string[]} [errors] @returns {Map<string, Set<string>>} audienceId -> expected skill names */
export function expectedByAudience(skills, agentNames, workers, errors) {
  /** @type {Map<string, Set<string>>} */
  const expected = new Map();
  expected.set(ORCH, new Set());
  for (const n of agentNames) expected.set(n, new Set());
  for (const [skill, tokens] of skills) {
    if (!tokens.length)
      errors?.push(
        `skill \`${skill}\` has no \`agents:\` tag — every skill must declare an audience`,
      );
    for (const t of tokens)
      for (const id of expandToken(t, agentNames, workers, errors)) expected.get(id)?.add(skill);
  }
  return expected;
}

/** Read everything + compute the projection in one call. Workers = agents with the board tool.
 * @returns {{ skills: Map<string,string[]>, agents: ReturnType<typeof readAgents>,
 *   agentNames: string[], workers: string[], expected: Map<string,Set<string>>, errors: string[] }} */
export function loadRegistry() {
  const skills = readSkills();
  const agents = readAgents();
  const agentNames = [...agents.keys()].sort();
  const workers = agentNames.filter((n) => agents.get(n)?.tools.includes("mcp__ui__tasks"));
  /** @type {string[]} */
  const errors = [];
  const expected = expectedByAudience(skills, agentNames, workers, errors);
  return { skills, agents, agentNames, workers, expected, errors };
}
