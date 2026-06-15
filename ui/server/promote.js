// forge promote — move a game-local capability into the framework plugin so EVERY game
// gets it. Authoring defaults to game-local (game/.claude/skills|agents, or game/tools);
// promotion is the deliberate, human-chosen step that globalizes it (the executor behind
// the orchestrator's "promote to the framework?" gate). After the move the capability is
// gone from this game and the next session loads it from the plugin as xenodot:<name>.
//
// Usage: npm run promote -- <skills|agents|tools> <name> [/path/to/game]
//   e.g. npm run promote -- skills godot-decals
//        npm run promote -- agents shader-author
//        npm run promote -- tools profile_frame.gd
import { existsSync, renameSync, rmSync, mkdirSync, cpSync } from "node:fs";
import path from "node:path";
import { PROJECT_DIR, FRAMEWORK_PLUGIN_DIR } from "./config.js";

const KINDS = new Set(["skills", "agents", "tools"]);
const [kind, name, gameArg] = process.argv.slice(2);
const game = gameArg ? path.resolve(gameArg) : PROJECT_DIR;

if (!kind || !KINDS.has(kind) || !name) {
  console.error("usage: npm run promote -- <skills|agents|tools> <name> [/path/to/game]");
  process.exit(1);
}

/** Resolve the game-local source path and the plugin destination for this capability.
 * @param {string} kind @param {string} name */
function locate(kind, name) {
  if (kind === "skills") {
    return {
      src: path.join(game, ".claude", "skills", name),
      dst: path.join(FRAMEWORK_PLUGIN_DIR, "skills", name),
    };
  }
  if (kind === "agents") {
    const file = name.endsWith(".md") ? name : `${name}.md`;
    return {
      src: path.join(game, ".claude", "agents", file),
      dst: path.join(FRAMEWORK_PLUGIN_DIR, "agents", file),
    };
  }
  return {
    src: path.join(game, "tools", name),
    dst: path.join(FRAMEWORK_PLUGIN_DIR, "tools", name),
  };
}

/** Move src→dst, falling back to copy+remove across filesystems. @param {string} src @param {string} dst */
function movePath(src, dst) {
  try {
    renameSync(src, dst);
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e)?.code !== "EXDEV") throw e;
    cpSync(src, dst, { recursive: true });
    rmSync(src, { recursive: true, force: true });
  }
}

const { src, dst } = locate(kind, name);

if (!existsSync(src)) {
  console.error(`promote: nothing to promote — ${src} not found.`);
  console.error(`  Author the ${kind.replace(/s$/, "")} game-local first, then promote it.`);
  process.exit(1);
}
if (existsSync(dst)) {
  console.error(`promote: ${dst} already exists in the plugin — remove or rename it first.`);
  process.exit(1);
}

mkdirSync(path.dirname(dst), { recursive: true });
movePath(src, dst);

const label = name.replace(/\.md$/, "");
console.log(`promote: moved ${kind}/${name}`);
console.log(`  from game-local: ${src}`);
console.log(`  into the plugin: ${dst}`);
console.log(`Now available to every game as xenodot:${label} — restart the session to load it.`);
if (kind !== "tools") console.log("Tip: run `npm run badges` to refresh the README counts.");
