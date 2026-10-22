---
name: dependabot-alerts-without-update-prs
kind: verdicts
description: Dependabot security alerts are on, but Dependabot version and security update PRs are off, because exact pins plus a release-age delay are the update policy.
status: accepted
tags: [deps, security, ci]
date: 2026-09-26
source: forge A21
---

# Security alerts on, update PRs off

## Context

The repo pins every dependency exactly and delays new releases with pnpm's minimum release age. Bot PRs would bump pins outside that policy.

## Decision

Turn on vulnerability alerts and the dependency graph. Keep automated security fixes off and add no dependabot config file.

## Why

Alerts tell us what is vulnerable; the owner decides the pin. Bot bumps would bypass the researched-pin rule.
