# Contract

Agent: the orchestrator. Job: write the issue, once, from what the owner confirmed at Direction. The product side only.

## The shape

```
What: <at most 3 lines>
Why: <1 line>
Done when: <checks a person or a command can run: a state change, a response, a number>
Not in scope: <at most 2 lines, each with its reason>
How far: <pull request opened | merged | deployed>, as the owner confirmed
Proof: <what must be seen and how | none, the owner decided no proof is needed>, as the owner confirmed
Business rules: <the owner's words, quoted>
```

## Do

- `[judgment]` Write only what the owner confirmed. No line of yours becomes his decision here.
- `[judgment]` No file list and no technical path. Those belong to Design.
- `[judgment]` "Done when" is written so it can be checked. Mark `[human check]` where only a person can judge.
- `[code, not built]` Every line of the shape is filled. Until a tool checks it, read the seven lines back before you go on.
- `[judgment]` The original text of the issue stays in the thread. The body becomes the contract.

## After this step

- `[judgment]` The contract changes only on the owner's word. Later steps add sections under it (facts, design, plan). They do not edit it.

## Next

Design. No stop.
