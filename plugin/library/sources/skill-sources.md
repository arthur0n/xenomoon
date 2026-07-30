# Skill sources — where to fetch external skill material

Registry the `researcher` (skill-gap mode) searches on demand. One entry per source:
URL, license, what it's good for, and what we already took (so demand-pull starts from
the delta, not from scratch).

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
