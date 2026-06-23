#!/usr/bin/env bash
# sync-upstream.sh — pull upstream improvements INTO our fork. One-way: we only
# ever FETCH from the source and NEVER push back to it (a pre-push hook enforces
# this). See docs/whitelabel/SYNC.md for the full rationale.
#
#   main = OUR xenomoon trunk — branded end-to-end, rebrand COMMITTED. Upstream is
#          MERGED in (NOT rebased), then the xenomoon rebrand is re-run + committed.
#   We keep no local upstream-mirror branch; upstream/main is read directly.
#
# Flags:
#   --no-test  skip `npm run test:onboarding` (faster, less safe)
set -euo pipefail
cd "$(dirname "$0")/.."

RUN_TEST=1
for arg in "$@"; do
  case "$arg" in
    --no-test) RUN_TEST=0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

echo "==> fetching upstream (read-only source; we never push to it)"
git fetch upstream

echo "==> merging upstream/main into our trunk 'main' (rebrand is committed; expect conflicts on rebranded lines)"
git checkout main
if ! git merge --no-ff upstream/main; then
  echo
  echo "Merge conflicts — resolve them, then finish the sync by hand:"
  echo "  - keep README ours; keep the DOMAIN seam in ui/server/core/config.js"
  echo "  - re-apply the asset/level + FEATURES.md divergences per docs/whitelabel/SEAMS.md"
  echo "  - node scripts/strip-godot.mjs        # delete the re-merged Godot payload"
  echo "  - git add -u && git commit            # complete the merge"
  echo "  - node scripts/rebrand.mjs && git commit -am 'sync: strip godot + re-flip rebrand'"
  echo "  - node scripts/strip-godot.mjs --check && node scripts/rebrand.mjs --check && npm run validate"
  exit 1
fi

echo "==> stripping the re-merged Godot payload (idempotent; keeps the fork Godot-free)"
node scripts/strip-godot.mjs

if [ "$RUN_TEST" = 1 ]; then
  echo "==> onboarding gate"
  npm install --silent
  npm run test:onboarding
fi

echo
echo "Done. upstream/main merged + Godot stripped. Re-brand the merged-in upstream strings:"
echo "    node scripts/rebrand.mjs && git commit -am 'sync: strip godot + re-flip rebrand'"
echo "    node scripts/strip-godot.mjs --check && node scripts/rebrand.mjs --check   # both clean"
echo "Publish to our repo:  git push xenomoon main"
