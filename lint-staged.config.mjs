// Pre-commit: lint + format only the staged files. eslint runs with
// --max-warnings 0 so any Tier A warning fails the commit; --fix auto-resolves
// what it can; --no-warn-ignored so a staged file in an eslint-ignored path (e.g.
// .claude/workflows/*.js, which use the Workflow DSL globals) is skipped silently
// instead of failing the commit on a "File ignored" warning. HTML is intentionally
// left out so index.html's hand-tuned markup isn't reflowed.
export default {
  "**/*.js": ["eslint --max-warnings 0 --no-warn-ignored --fix", "prettier --write"],
  "**/*.{json,md,css}": ["prettier --write"],
};
