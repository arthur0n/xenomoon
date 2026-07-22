// Domain-pack learning scaffolds, GENERATED on demand — every domain pack needs
// `plugin/{skills,library}/` for the learning loop (promotions land there; XENOMOON_LIBRARY
// points there), but packs are born without them (webapp/expo/app all shipped bare). Rather
// than hand-authoring per domain, callers (doctor, promoteOne) ensure them lazily; idempotent
// and cheap (existsSync guards). Kinds follow the `library-record-writing` skill's contract —
// one dir + `index.md` per kind, records as `<kind>/<slug>.md` with machine-face frontmatter.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/** The domain-agnostic record kinds (godot-era `addons`/`transcripts` are upstream-only). */
export const LIBRARY_KINDS = ["findings", "verdicts", "tools"];

/** Seed header for a kind index — the append step keeps it sorted under this line.
 * @param {string} kind */
const indexSeed = (kind) =>
  `# ${kind} — index\n\nOne line per record, sorted by filename: \`- [<title>](<slug>.md) — <description>\`\n`;

const LIBRARY_README = `# Domain library — learned records

Durable, PROMOTED learnings for this domain: one page per record, machine-face frontmatter
(\`name\`/\`description\` a router can act on), kind dirs with an \`index.md\` each. Records
arrive via the promotions board (kind \`library\`) from a bound project's
\`.claude/library/<kind>/<slug>.md\` draft — see \`plugin/docs/process/updates-routing.md\`
(the DOMAIN path) and the \`library-record-writing\` skill (the format contract).
`;

const SKILLS_README = `# Domain skills — promoted capabilities

Skills this domain LEARNED from bound projects, landed via the promotions board (kind
\`skills\`) from a project's \`.claude/skills/<name>/\`. See
\`plugin/docs/process/updates-routing.md\` (the DOMAIN path). A newly promoted skill loads on
the next session.
`;

/** Ensure `<pluginDir>/{skills,library}` learning scaffolds exist. Idempotent; returns the
 * list of paths it created (empty = everything was already there).
 * @param {string} pluginDir the domain pack's plugin root (e.g. domains/webapp/plugin)
 * @returns {string[]} created paths */
export function ensureDomainLibrary(pluginDir) {
  /** @type {string[]} */
  const created = [];
  const write = (/** @type {string} */ file, /** @type {string} */ text) => {
    if (existsSync(file)) return;
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
    created.push(file);
  };
  write(path.join(pluginDir, "skills", "README.md"), SKILLS_README);
  write(path.join(pluginDir, "library", "README.md"), LIBRARY_README);
  for (const kind of LIBRARY_KINDS)
    write(path.join(pluginDir, "library", kind, "index.md"), indexSeed(kind));
  return created;
}
