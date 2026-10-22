---
name: ci-actions-pinned-to-sha-with-vendored-metadata
kind: verdicts
description: The gate lints workflows and refuses any action not pinned to a full commit sha with a dated version comment, any pin without the action's metadata vendored at that sha, and any input key the metadata does not declare.
status: accepted
tags: [ci, security, deps]
date: 2026-10-09
source: tools-server 11b
---

# Workflow actions pinned by sha and checked

## Context

Workflow files are code that runs with secrets; a moved tag or a typo in an input is invisible in review.

## Decision

The gate runs actionlint and a checker that reads every workflow with a YAML parser and refuses: a uses not pinned to a 40-hex sha with a researched-date comment; a pin without vendored action metadata; an input the metadata does not declare; unused metadata; anchors, aliases, merge keys and YAML directives; symlinks in the metadata folder. A policy table adds per-action rules, such as least permission on app-token steps.

## Why

Supply-chain pins that a machine checks, and a checker that reads exactly what the runner reads.
