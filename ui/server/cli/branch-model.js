// The branch-model question, as a picklist the installer can print and parse.
//
// It used to be three bare words with `[empty = trunk]`, and the meanings lived in a code
// comment nobody installing would read. Worse than terse: trunk means "land directly on the
// default branch", so on a repo that deploys from `main` the ENTER key selected "every commit
// ships to production" — the safest-looking answer was the most dangerous one.
//
// So the order and the default are DERIVED from the project: if something deploys on push to
// the default branch, `pr-main` leads and the deploy workflows are named. Same doctrine the
// rest of the CLI follows — say what you found and why you picked it, never decide silently.
//
// Pure by design: the caller does the file reading, this decides and formats.

import { render, choose as pick } from "./picklist.js";

/** @typedef {{ id: string, summary: string, when: string }} BranchModel */

/** The models, in their stable definitions. Ordering is decided per project by `order()`. */
export const BRANCH_MODELS = /** @type {BranchModel[]} */ ([
  {
    id: "pr-main",
    summary: "short-lived branch → PR → default branch; the branch dies at the merge",
    when: "nothing reaches the default branch unreviewed",
  },
  {
    id: "trunk",
    summary: "work lands directly on the default branch",
    when: "fine while nothing deploys from it",
  },
  {
    id: "staged",
    summary: "work lands on a dev branch; the default branch takes promotion merges only",
    when: "strictest — needs a dev branch to exist",
  },
]);

/** Workflow files that run on a push to `branch`.
 *
 * Deliberately conservative: it matches the `on: push:` trigger listing the branch, NOT the
 * word "deploy" anywhere in the file. A workflow that merely mentions deployment is not a
 * deployment, and a false warning here would train someone to ignore a true one.
 * @param {{ name: string, text: string }[]} workflows @param {string} branch
 * @returns {string[]} names, in the order given */
export function deploysOnPush(workflows, branch) {
  return workflows
    .filter(({ text }) => {
      const on = /(^|\n)on:\s*(\n[\s\S]*?)?(?=\n\S|$)/.exec(text)?.[0] ?? "";
      const push = /(^|\n)\s+push:\s*(\n[\s\S]*?)?(?=\n\s{0,2}\S|$)/.exec(on)?.[0] ?? "";
      if (!push) return false;
      const branches = /branches:\s*(\[[^\]]*\]|(?:\n\s+-\s*\S+)+)/.exec(push)?.[1] ?? "";
      // No `branches:` filter means every branch, which includes this one.
      if (!branches) return true;
      return new RegExp(`(^|[\\s\\[,'"-])${branch}([\\s\\],'"]|$)`).test(branches);
    })
    .map(({ name }) => name);
}

/** The models with the safer one first when the default branch is a deploy trigger.
 * @param {boolean} deploysFromDefault @returns {BranchModel[]} */
export function order(deploysFromDefault) {
  const by = /** @param {string} id */ (id) =>
    /** @type {BranchModel} */ (BRANCH_MODELS.find((m) => m.id === id));
  return deploysFromDefault
    ? [by("pr-main"), by("trunk"), by("staged")]
    : [by("trunk"), by("pr-main"), by("staged")];
}

/** Name the actual branch instead of saying "the default branch" — on a repo whose branch is
 * `master` or `develop` the generic phrase is one more thing to translate mid-decision. The
 * article goes with it, or the line reads "the `main`".
 * @param {string} text @param {string} branch @returns {string} */
const named = (text, branch) =>
  text
    .replaceAll("the default branch", `\`${branch}\``)
    .replaceAll("default branch", `\`${branch}\``);

/** The models as picklist rows, with the project's real branch name in the prose.
 * @param {BranchModel[]} models @param {string} branch
 * @returns {import("./picklist.js").PickItem[]} */
export const items = (models, branch) =>
  models.map((m) => ({
    id: m.id,
    summary: named(m.summary, branch),
    detail: named(m.when, branch),
  }));

/** What the installer prints: the list, the warning when earned, and the guideline note.
 * @param {{ models: BranchModel[], branch: string, deployWorkflows: string[] }} opts
 * @returns {string} */
export function prompt({ models, branch, deployWorkflows }) {
  return render({
    title: `Branch model — how work reaches \`${branch}\`.`,
    items: items(models, branch),
    warning:
      deployWorkflows.length > 0
        ? [
            `${deployWorkflows.join(", ")} run on push to \`${branch}\`.`,
            `  Under \`trunk\`, every commit ships to production.`,
          ]
        : [],
    note: [
      "A guideline the agents follow — and the line the push gates draw: a work-branch push",
      "is routine, one reaching your deploy branch asks (policy.push). One line in",
      "<project>/.xenomoon/branch-model; change it whenever the project does.",
    ],
  });
}

/** The model an answer selects. @param {string} answer @param {BranchModel[]} models
 * @returns {string | null} */
export const choose = (answer, models) => pick(answer, items(models, ""));
