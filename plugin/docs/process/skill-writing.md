# Writing skills — the doctrine

How a skill (or agent prompt, or command) earns its tokens. Applies to every capability
this framework ships or learns — the learn loop writing a project skill, a promotion
lifting one into `plugin/`, a human editing the roster. Adapted from Matt Pocock's
`writing-great-skills`; converges with our positive-form lane rules.

A skill exists to wrangle **predictability** out of a stochastic system — the agent
taking the same _process_ every run. Every rule below serves that.

## The economics — two loads

- **Context load** — a model-invoked skill's `description` sits in the window every
  turn. Each one must pay rent through its triggers.
- **Cognitive load** — a user-invoked capability costs nothing in context, but the
  human must remember it exists.

Our defaults: shipped skills are model-invoked and **scoped** (`agents: [...]` tag —
only the named agents carry the description; scoping IS our context-load control).
Forge-local commands (`.claude/commands/`) are the user-invoked side — human-fired,
zero session load.

## Descriptions

Two jobs only: what the skill is + the **branches** that trigger it. Front-load the
leading word. One trigger per branch — synonyms restating one branch are duplication.
Identity that's already in the body gets cut.

## The information ladder

1. **In-skill step** — ordered action, ends on a **checkable completion criterion**
   ("every open entry drained", not "process the queue"). A fuzzy criterion invites
   premature completion.
2. **In-skill reference** — rules/definitions consulted on demand; a flat peer-set is
   fine.
3. **Disclosed reference** — pushed to a sibling file behind a pointer, loaded only
   when the pointer fires. Inline what every branch needs; disclose what only some
   branches reach.

## Leading words

A compact pretrained concept the agent thinks with (_verbatim_, _human-gated_,
_the bar_, _grill_, _index-only_). One strong word retires a paragraph of restatement
and anchors both execution (body) and invocation (description). Hunt restatements;
collapse them into the word.

## Pruning — failure modes to hunt

- **No-op** — a line the model already obeys ("be thorough"). Test each sentence: does
  it change behavior vs. default? Delete failures whole.
- **Duplication** — one meaning, two homes. Keep a single source of truth; changing a
  behavior must be a one-place edit.
- **Sediment** — stale layers nobody dares remove. The audit loop exists to dredge it.
- **Sprawl** — every line live, still too long. Cure with the ladder, not compression.
- **Negation** — "don't X" names X and makes it more available. State the target
  behavior positively; keep a prohibition only as a hard guardrail, paired with what to
  do instead. (Same law as the pipeline's positive-form lane rules.)

## House rules (ours, not Pocock's)

- Frontmatter: `name`, `agents: [...]` (scope tag — validated against the agent's
  `skills:` by `npm run validate`), `domain`, `description`.
- One page. A skill that needs more is hiding a disclosure or a split.
- Project-learned skills follow this doctrine from birth — a promotion should never
  have to rewrite a skill to make it shippable.
