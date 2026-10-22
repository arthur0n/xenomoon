---
name: agent-files-readable-types-only
kind: verdicts
description: A pipeline passes only image and PDF attachments to the agent as files and names every other attachment in the message text, because the model provider rejects other file types before any request.
status: accepted
amends: [one-message-one-run-agent-owns-thread]
tags: [llm, agent-forge, email]
date: 2026-09-12
source: platform D17
---

# Only readable file types reach the agent as files

## Context

A real mail carried an S/MIME signature file. The model SDK accepts only `image/*` and `application/pdf` as
file URLs and refuses other types before any model request, so the agent call failed on every retry.

## Decision

One shared helper splits attachments by media type (trimmed, lower-cased, never by extension): readable
types go as file parts; every other file is named in a note appended to the message, with its name, type and
signed URL, saying it did not arrive as a file. The agent's prompt turns a missing file into a question. The
skipped files are on the step output for the operator. Not a config key: it is the provider's limit.

## Why

- One unreadable attachment must not kill the whole run.
- A dropped file becomes a question, not an answer built from what was left.
