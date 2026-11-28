# CI qa-gate job

A fail-closed job on the project side that makes the pipeline's commit gate enforceable at the
deploy boundary, not just advisory.

Before a deploy, grep the head commit message for issue refs `(#N)`. For each referenced issue,
require `qa:pass` and `review:pass`, and the absence of `qa:blocked` and `review:changes`. Fail the
deploy if any referenced issue misses the gate, or if the labels cannot be read. A missing signal
blocks; it never ships.

Check the SHA, not just the label. A pass comment carries `qa-verified: <sha>` or
`review-verified: <sha>`, and `qa-content:` / `review-content:`. A blocking comment carries
`qa-blocked-at:` or `review-changes-at:` and never ships. Require the `-verified` marks to match the commit being deployed: a label says an issue
passed once, never that this code passed.
