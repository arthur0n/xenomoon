# Framework sources — external material the FRAMEWORK itself adapted

Registry of sources for framework-level (meta/methodology) capabilities: what we took,
what we deliberately dropped, where to fetch the rest. One entry per source.

NOT the project-stack registry: domain packs install their own
`library/sources/skill-sources.md` (vendor-official repos the `researcher` searches in
skill-gap mode) — this file deliberately lives at a DIFFERENT path so a pack install never
CLOBBERS a trunk-tracked file (that collision breaks `xenomoon update`). The rule is enforced
mechanically now: `npm run check:install-paths` fails on any pack file whose install target is
tracked, minus an explicit `SANCTIONED_MERGE` allowlist (`plugin/hooks/hooks.json`, which the
installer merges rather than overwrites — CORE owns the file, packs contribute entries).

## General / agent-workflow

- **mattpocock/skills** — https://github.com/mattpocock/skills — MIT.
  Curated agent skills (productivity + engineering): grilling/grill-me (interview
  technique), writing-great-skills (skill-authoring doctrine), wayfinder (multi-session
  planning maps), handoff, teach.
  **Already adapted here:** `grill` (from grilling/grill-me),
  `plugin/docs/process/skill-writing.md` (from writing-great-skills), and the
  `xeno-epic` skill + `mcp__ui__epic` tool (a TINY wayfinder — decisions ledger + fog on
  one epic issue; deliberately dropped: per-decision child tickets, claim protocol,
  native blocking edges/frontier queries, prototype ticket type). If an epic ever needs
  that heavier machinery, fetch `skills/engineering/wayfinder/SKILL.md` and adapt the
  missing piece — don't reinvent it.
