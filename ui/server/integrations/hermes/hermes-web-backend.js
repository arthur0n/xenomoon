// Web research backend seeding — the interactive half of the guardrail that hermes-check.js
// detects. Enabling the `web` toolset is NOT enough: without a backend provider the gateway
// still lists the tool, runs "succeed", and the model answers from memory with uncited (and
// sometimes fabricated) prose. This module makes sure a backend actually exists behind the
// toolset: a credentialed provider key seeded into the PROFILE's .env (files survive gateway
// restarts; ambient shell env — the cause of a real outage — does not), or the free `ddgs`
// package as the no-key floor.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { detectWebBackend, hermesPythonCandidates } from "./hermes-check.js";

/** Install the free `ddgs` (DuckDuckGo) search package into Hermes' own python, repairing
 * pip with ensurepip first when the venv shipped without it. @returns {boolean} */
export function installDdgs() {
  for (const py of hermesPythonCandidates()) {
    const pipOk =
      spawnSync(py, ["-m", "pip", "--version"], { stdio: "ignore", timeout: 30_000 }).status === 0;
    if (!pipOk) {
      spawnSync(py, ["-m", "ensurepip", "--upgrade"], { stdio: "ignore", timeout: 120_000 });
    }
    const r = spawnSync(py, ["-m", "pip", "install", "ddgs"], {
      stdio: "inherit",
      timeout: 180_000,
    });
    if (r.status === 0) return true;
  }
  return false;
}

/** Make sure the `web` toolset has a real search backend behind it: detect a credentialed
 * backend (profile .env / process env / ddgs), else seed one — a `--firecrawl-key=…` flag
 * value, an interactive paste, or the free ddgs fallback. Loud on skip.
 * @param {{
 *   toolsets: string,
 *   profile: string,
 *   envFile: string,
 *   flagKey: string | undefined,
 *   assumeYes: boolean,
 *   rl: import("node:readline/promises").Interface,
 *   configSet: (key: string, value: string) => boolean,
 *   upsertEnv: (text: string, key: string, value: string) => string,
 * }} opts */
export async function ensureWebBackend(opts) {
  const toolsetList = opts.toolsets.split(",").map((s) => s.trim());
  if (!toolsetList.includes("web") && !toolsetList.includes("search")) return;
  console.log("\nWeb research backend (the part every install trips over):");

  /** Seed FIRECRAWL_API_KEY into THIS profile's .env + point web at it. @param {string} key */
  const seedFirecrawl = (key) => {
    let text = "";
    try {
      text = readFileSync(opts.envFile, "utf8");
    } catch {
      /* no .env yet */
    }
    writeFileSync(opts.envFile, opts.upsertEnv(text, "FIRECRAWL_API_KEY", key), { mode: 0o600 });
    console.log(`  ✓ FIRECRAWL_API_KEY → ${opts.envFile}`);
    opts.configSet("web.backend", "firecrawl");
  };

  if (opts.flagKey) {
    seedFirecrawl(opts.flagKey);
    return;
  }

  const found = detectWebBackend(opts.profile);
  if (found.backend) {
    console.log(`  ✓ backend available: ${found.backend} (${found.source})`);
    if (found.backend !== "ddgs") opts.configSet("web.backend", found.backend);
    else opts.configSet("web.search_backend", "ddgs");
    return;
  }

  console.log("  ✗ NO search backend is usable — research runs would return uncited prose");
  console.log("    from model memory (retries have even fabricated citations). Options:");
  console.log(
    "      · Firecrawl — free tier, 1,000 credits: https://firecrawl.dev (search + extract)",
  );
  console.log("      · ddgs — free DuckDuckGo package, no account (search only, no extract)");
  const answer = opts.assumeYes
    ? ""
    : (
        await opts.rl.question(
          "  Paste a Firecrawl API key (Enter = install the free ddgs fallback, 'skip' = leave broken): ",
        )
      ).trim();
  if (answer && answer.toLowerCase() !== "skip") {
    seedFirecrawl(answer);
    return;
  }
  if (answer.toLowerCase() === "skip") {
    console.log(
      "  ⚠ Skipped — `npm run hermes:check` will keep flagging this until a backend exists.",
    );
    return;
  }
  console.log("  Installing the free ddgs fallback into Hermes' python…");
  if (installDdgs()) {
    opts.configSet("web.search_backend", "ddgs");
    console.log("  ✓ ddgs installed — web_search works free; web_extract still needs a");
    console.log("    Firecrawl/Exa/Parallel key (re-run with --firecrawl-key=… anytime).");
  } else {
    console.log("  ✗ Couldn't install ddgs automatically. Do one of:");
    console.log("      pip install ddgs           # into Hermes' python");
    console.log(`      add FIRECRAWL_API_KEY=… to ${opts.envFile}`);
  }
}
