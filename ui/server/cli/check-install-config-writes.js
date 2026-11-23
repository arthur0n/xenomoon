// check:install-config — a best-effort text check (not a parser, not a security control) against accidental direct writes: only ui/lib/install-config.js writes the install's `.xenomoon.json`.
// Fails: a write call (WRITE_CALLS or an fs alias of one) whose path argument holds `.xenomoon.json` (literals joined by `+` count as one; a template counts by its static text, each `${}` breaking it), `CONFIG_FILE`, or a name assigned from either outside a non-path call.
// A call named like a write API whose path names the install file is flagged whatever its receiver (`store.writeFileSync(...)` too: the check does not resolve receivers); route that write through updateInstallConfig.
// A name once bound to the install file counts as that file in the whole source file (scope and order ignored, so a function using a name declared below it stays covered): rename a reused variable.
// Not seen: a split through a variable (`a + ".json"`), a path from another module under another name, from a helper call or a parameter, a write function passed into another module, dynamic access (`fs[name]`), a call inside a template's `${}`, a `+` split of a template whose `${}` holds a template or braces two deep, regex literals.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** @typedef {{ line: number, text: string, call: string }} Violation */
/** @typedef {{ code: string, shape: string, names: Set<string>, aliases: Map<string, string> }} Scan */

const FIX = "use updateInstallConfig from ui/lib/install-config.js";
const REUSE =
  "if this name was bound to .xenomoon.json elsewhere in the file and now holds another path, give that path its own name";
/** Write APIs (sync, callback and `fs.promises` share names) → indexes of their path arguments. */
const WRITE_CALLS = new Map([
  ["writeFileSync", [0]],
  ["writeFile", [0]],
  ["appendFileSync", [0]],
  ["appendFile", [0]],
  ["createWriteStream", [0]],
  ["truncateSync", [0]],
  ["truncate", [0]],
  ["rmSync", [0]],
  ["rm", [0]],
  ["unlinkSync", [0]],
  ["unlink", [0]],
  ["renameSync", [0, 1]],
  ["rename", [0, 1]],
  ["copyFileSync", [0, 1]],
  ["copyFile", [0, 1]],
  ["cpSync", [0, 1]],
  ["cp", [0, 1]],
  ["openSync", [0]],
  ["open", [0]],
]);
const OPENERS = { "(": ")", "[": "]", "{": "}" };
const CLOSERS = new Set([")", "]", "}"]);
const ID = "[A-Za-z_$][\\w$]*";
const FS_MOD = `["'](?:node:)?fs(?:/promises)?["']`;
const REQUIRE_FS = `require\\(\\s*${FS_MOD}\\s*\\)`;

/** Replace `out[from..to)` by spaces, newlines kept. @param {string[]} out @param {number} from
 * @param {number} to */
function blankRange(out, from, to) {
  for (let k = from; k < to && k < out.length; k++) if (out[k] !== "\n") out[k] = " ";
}

/** `src` with every comment (`what` "comments") or every string and template literal's contents
 * (`what` "strings", quotes kept) replaced by spaces; length and newlines kept, so offsets hold.
 * @param {string} src @param {"comments" | "strings"} what @returns {string} */
function blank(src, what) {
  const out = src.split("");
  const strings = what === "strings";
  /** @type {string | null} */
  let quote = null;
  for (let i = 0; i < src.length; i++) {
    const c = src.charAt(i);
    if (c === "\\") {
      if (quote && strings) blankRange(out, i, i + 2);
      i++;
    } else if (quote) {
      if (closes(c, quote)) quote = null;
      else if (strings) blankRange(out, i, i + 1);
    } else if (QUOTES.has(c)) quote = c;
    else if (!strings && isCommentStart(src, i)) i = blankOne(src, out, i) - 1;
  }
  return out.join("");
}

const QUOTES = new Set(['"', "'", "`"]);
/** Does `c` end a literal opened by `quote` (its own quote, or a newline outside a template)?
 * @param {string} c @param {string} quote */
const closes = (c, quote) => c === quote || (c === "\n" && quote !== "`");
/** @param {string} src @param {number} i */
const isCommentStart = (src, i) => src[i] === "/" && (src[i + 1] === "/" || src[i + 1] === "*");

/** `src` with every comment replaced by spaces (newlines kept, so line numbers hold).
 * @param {string} src @returns {string} */
export const blankComments = (src) => blank(src, "comments");

/** Blank the comment starting at `i`; returns the index after it.
 * @param {string} src @param {string[]} out @param {number} i @returns {number} */
function blankOne(src, out, i) {
  const block = src[i + 1] === "*";
  let end = block ? src.indexOf("*/", i + 2) : src.indexOf("\n", i);
  end = end === -1 ? src.length : block ? end + 2 : end;
  blankRange(out, i, end);
  return end;
}

/** The text from `start` to the end of the expression: a `;`, a `,` or a closer at depth 0, or a
 * newline at depth 0 not followed by a continuation. @param {string} code @param {number} start */
function expressionAt(code, start) {
  let depth = 0;
  let i = start;
  for (; i < code.length; i++) {
    const c = code.charAt(i);
    if (c in OPENERS) depth++;
    else if (CLOSERS.has(c)) {
      if (depth === 0) break;
      depth--;
    } else if (depth === 0 && (c === ";" || c === ",")) break;
    else if (depth === 0 && c === "\n" && i > start && code.slice(start, i).trim()) {
      const continues = /(?:[.?:+]|\|\||&&)\s*$/.test(code.slice(start, i));
      if (!continues && !/^\s*(?:[.?:+]|\|\||&&)/.test(code.slice(i + 1))) break;
    }
  }
  return code.slice(start, i);
}

/** Top-level arguments of the call whose `(` is at `open`: bounds read from `shape` (same offsets,
 * strings may be blanked), text from `code`. @param {string} code @param {number} open
 * @param {string} [shape] @returns {string[]} */
function callArgs(code, open, shape = code) {
  /** @type {string[]} */
  const args = [];
  let depth = 0;
  let from = open + 1;
  for (let i = open + 1; i < shape.length; i++) {
    const c = shape.charAt(i);
    if (c in OPENERS) depth++;
    else if (CLOSERS.has(c) && depth-- === 0) {
      args.push(code.slice(from, i));
      break;
    } else if (c === "," && depth === 0) {
      args.push(code.slice(from, i));
      from = i + 1;
    }
  }
  return args;
}

/** One string literal: quoted, or a template without `${}`. */
const LITERAL = String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\`(?:[^\`\\$]|\\.|\$(?!\{))*\``;
const LITERAL_RUN = new RegExp(`(?:${LITERAL})(?:\\s*\\+\\s*(?:${LITERAL}))*`, "g");
const ONE_LITERAL = new RegExp(LITERAL, "g");

/** `text` with each run of string literals joined by `+` folded into one literal, so
 * `".xenomoon" + ".json"` reads `".xenomoon.json"`. Lengths change: use it for the naming
 * decision only, never for offsets. @param {string} text @returns {string} */
export function foldLiterals(text) {
  return text.replace(
    LITERAL_RUN,
    (run) => `"${[...run.matchAll(ONE_LITERAL)].map((m) => m[0].slice(1, -1)).join("")}"`,
  );
}

const INTERPOLATION = String.raw`\$\{(?:[^{}\`]|\{[^{}\`]*\})*\}`;
/** A quoted literal (kept as is) or a template that may hold `${}` parts. */
const ANY_LITERAL = new RegExp(
  String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\`(?:[^\`\\$]|\\.|\$(?!\{)|${INTERPOLATION})*\``,
  "g",
);
const ESCAPE_OR_INTERPOLATION = new RegExp(String.raw`\\.|${INTERPOLATION}`, "g");

/** `text` with each template's `${}` parts replaced by a NUL, so a template reads as its static
 * text and an interpolation still breaks a name. @param {string} text @returns {string} */
const maskInterpolations = (text) =>
  text.replace(ANY_LITERAL, (lit) =>
    lit[0] === "`" ? lit.replace(ESCAPE_OR_INTERPOLATION, (p) => (p[0] === "\\" ? p : "\0")) : lit,
  );

/** Does `text` hold the install file's name as literal text (folded, templates by static text)?
 * @param {string} text */
const holdsFileName = (text) => foldLiterals(maskInterpolations(text)).includes(".xenomoon.json");

/** Does `text` name the install file: the literal, or a tainted identifier as a whole token?
 * @param {string} text @param {Set<string>} names */
function namesConfig(text, names) {
  if (holdsFileName(text)) return true;
  for (const n of names)
    if (new RegExp(`(?<![\\w$.])${n.replace(/\$/g, "\\$")}(?![\\w$])`).test(text)) return true;
  return false;
}

/** Calls that build a path from their arguments; any other call's result is not the path. */
const PATH_BUILDERS = new Set(["join", "resolve", "normalize", "String"]);

/** `expr` with every call other than a path builder removed, so `parseJSON(readFileSync(FILE))`
 * (the content) does not count as the path. @param {string} expr @returns {string} */
function pathPart(expr) {
  let out = expr;
  const call = /([A-Za-z_$][\w$]*)\s*\(/g;
  for (let m = call.exec(out); m; m = call.exec(out)) {
    if (PATH_BUILDERS.has(m[1] ?? "")) continue;
    const open = m.index + m[0].length - 1;
    const len = callArgs(out, open).join(",").length + 2;
    out = out.slice(0, m.index) + out.slice(open + len);
    call.lastIndex = m.index;
  }
  return out;
}

/** Every name assigned (declared, reassigned or defaulted) from an expression whose path part
 * names the install file, grown to a fixed point. @param {string} code @returns {Set<string>} */
function taintedNames(code) {
  const names = new Set(["CONFIG_FILE"]);
  const assign = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*=(?![=>])/g;
  /** @type {{ name: string, init: string }[]} */
  const inits = [];
  for (const m of code.matchAll(assign))
    inits.push({
      name: m[1] ?? "",
      init: pathPart(expressionAt(code, (m.index ?? 0) + m[0].length)),
    });
  for (let grew = true; grew; ) {
    grew = false;
    for (const { name, init } of inits)
      if (!names.has(name) && namesConfig(init, names)) {
        names.add(name);
        grew = true;
      }
  }
  return names;
}

/** Names bound to an fs module: `fs`, `fsp`, `promises`, `import * as N` / `import N` from an fs
 * module, `N = require("fs")`. @param {string} code @returns {Set<string>} */
function fsNamespaces(code) {
  const ns = new Set(["fs", "fsp", "promises"]);
  const forms = [
    new RegExp(
      `import\\s+(?:\\*\\s*as\\s+)?(${ID})\\s*(?:,\\s*\\{[^}]*\\})?\\s*from\\s*${FS_MOD}`,
      "g",
    ),
    new RegExp(`(${ID})\\s*=\\s*${REQUIRE_FS}`, "g"),
  ];
  for (const re of forms) for (const m of code.matchAll(re)) ns.add(m[1] ?? "");
  return ns;
}

/** `[source, local]` for each renamed specifier of `list` (`X as Y` when `sep` matches " as ",
 * `X: Y` when it matches ":"). @param {string} list @param {string} sep @returns {string[][]} */
function renamed(list, sep) {
  const one = new RegExp(`^(${ID})${sep}(${ID})`);
  /** @type {string[][]} */
  const out = [];
  for (const part of list.split(",")) {
    const m = part.trim().match(one);
    if (m) out.push([m[1] ?? "", m[2] ?? ""]);
  }
  return out;
}

/** Is `rhs` an fs namespace: a bound name or `require(fs module)`, optionally `.promises`?
 * @param {string} rhs @param {Set<string>} ns */
function isFsNamespace(rhs, ns) {
  const m = rhs.trim().match(new RegExp(`^(?:(${ID})|${REQUIRE_FS})(?:\\s*\\.\\s*promises)?$`));
  return !!m && (m[1] === undefined || ns.has(m[1]));
}

/** Local `save` for `const save = writeFileSync` / `= fs.writeFileSync` / `= otherAlias`, added to
 * `aliases` to a fixed point. @param {string} code @param {Set<string>} ns
 * @param {Map<string, string>} aliases */
function addReassignments(code, ns, aliases) {
  const obj = `(?:(${ID})\\s*\\.\\s*(?:promises\\s*\\.\\s*)?)?`;
  const re = new RegExp(`(?<![\\w$.])(${ID})\\s*=\\s*${obj}(${ID})\\s*(?=[;,)}\\n]|$)`, "g");
  const found = [...code.matchAll(re)];
  for (let grew = true; grew; ) {
    grew = false;
    for (const [, local = "", owner, from = ""] of found) {
      const api = aliases.get(from) ?? (WRITE_CALLS.has(from) ? from : undefined);
      if (!api || (owner && !ns.has(owner)) || aliases.get(local) === api) continue;
      aliases.set(local, api);
      grew = true;
    }
  }
}

/** Local name → the fs write API it stands for: `import { X as Y }` from an fs module,
 * `const { X: Y } = <fs namespace>`, and re-assignments. @param {string} code
 * @returns {Map<string, string>} */
function fsAliases(code) {
  const ns = fsNamespaces(code);
  /** @type {Map<string, string>} */
  const aliases = new Map();
  /** @param {string[]} pair */
  const bind = ([from = "", local = ""]) => {
    if (from === "promises") ns.add(local);
    else if (WRITE_CALLS.has(from)) aliases.set(local, from);
  };
  const imports = new RegExp(
    `import\\s+(?:${ID}\\s*,\\s*)?\\{([^}]*)\\}\\s*from\\s*${FS_MOD}`,
    "g",
  );
  for (const m of code.matchAll(imports)) renamed(m[1] ?? "", "\\s+as\\s+").forEach(bind);
  const destructure = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*([^;\n]+)/g;
  for (const m of code.matchAll(destructure))
    if (isFsNamespace(m[2] ?? "", ns)) renamed(m[1] ?? "", "\\s*:\\s*").forEach(bind);
  addReassignments(code, ns, aliases);
  return aliases;
}

/** An `open`/`openSync` whose flags are absent or read-only is a read. @param {string[]} args */
const isReadOpen = (args) => args.length < 2 || /^\s*["'`]r["'`]\s*$/.test(args[1] ?? "");

/** The write API the call at `m` (a match over `scan.shape`) performs on the install file, or null.
 * @param {Scan} scan @param {RegExpMatchArray} m @returns {string | null} */
function writeAt(scan, m) {
  const name = m[1] ?? "";
  const api = scan.aliases.get(name) ?? name;
  const which = WRITE_CALLS.get(api);
  if (!which) return null;
  const args = callArgs(scan.code, (m.index ?? 0) + m[0].length - 1, scan.shape);
  if (api.startsWith("open") && isReadOpen(args)) return null;
  return which.some((k) => namesConfig(args[k] ?? "", scan.names)) ? api : null;
}

/**
 * Direct writes of the install's `.xenomoon.json` in one source file's text.
 * @param {string} src @returns {Violation[]}
 */
export function findInstallConfigWrites(src) {
  if (!src.includes("CONFIG_FILE") && !holdsFileName(src)) return [];
  const code = blankComments(src);
  /** @type {Scan} */
  const scan = {
    code,
    shape: blank(code, "strings"),
    names: taintedNames(code),
    aliases: fsAliases(code),
  };
  const lines = src.split("\n");
  /** @type {Violation[]} */
  const found = [];
  const call = /(?<![\w$])(?<!function\s+)([A-Za-z_$][\w$]*)\s*\(/g;
  for (const m of scan.shape.matchAll(call)) {
    const api = writeAt(scan, m);
    if (!api) continue;
    const line = code.slice(0, m.index ?? 0).split("\n").length;
    found.push({ line, text: (lines[line - 1] ?? "").trim(), call: api });
  }
  return found;
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCAN = ["ui/server", "ui/lib"];
const ALLOWED = new Set(["ui/lib/install-config.js"]);
const SKIP_DIRS = new Set(["node_modules", "fixtures", "__fixtures__"]);

/** Source files under the scanned roots, repo-relative. @returns {string[]} */
function sourceFiles() {
  /** @type {string[]} */
  const out = [];
  const walk = (/** @type {string} */ rel) => {
    for (const e of readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(r);
      } else if (/\.(js|mjs|jsx)$/.test(e.name) && !/\.(test|check)\.js$/.test(e.name)) out.push(r);
    }
  };
  for (const s of SCAN) walk(s);
  return out.filter((f) => !ALLOWED.has(f)).sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = sourceFiles();
  let count = 0;
  for (const f of files)
    for (const v of findInstallConfigWrites(readFileSync(path.join(ROOT, f), "utf8"))) {
      if (!count++)
        console.error("✗ install-config: direct writes of the install's .xenomoon.json:");
      console.error(`    ${f}:${v.line}  ${v.text}\n      fix: ${FIX}; ${REUSE}`);
    }
  if (count) {
    console.error(`  ${count} direct write(s). The file is shared by several processes; ${FIX}.`);
    process.exit(1);
  }
  console.log(
    `ok  install-config: no direct write of .xenomoon.json in ${files.length} source files.`,
  );
}
