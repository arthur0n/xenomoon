---
name: agent-skills-private-repo-read-only-token
kind: verdicts
description: Agent skills live in their own private repo, one folder per skill, cloned into the sandbox with a token that can only read that repo.
status: accepted
tags: [agent-forge, sandbox, secrets]
date: 2026-09-25
source: forge A15
---

# Skills in a private repo with a read-only token

## Context

Upstream loads skills only from git (sparse clone inside the sandbox) or a vendor registry. A private repo needs a credential, and code in the sandbox can read that credential.

## Decision

Skills live in a dedicated private repo, `<name>/SKILL.md` per folder, pinned by commit in each agent's entry. The sandbox git credential store holds a fine-grained token with read-only access to that repo only, kept in the secret store. Our change to the core writes the credential before the skill download and gives the download the credential helper.

## Why

The token can only read what the agents read anyway. Rejected: skills inside the harness repo (the token would read all source), a local skill type (large upstream divergence), skills as tools (leaves upstream's skill mechanism).
