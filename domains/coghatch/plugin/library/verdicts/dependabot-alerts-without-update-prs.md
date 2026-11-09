---
type: verdicts
title: Security alerts on, update PRs off
description: Dependabot security alerts are on, but Dependabot version and security update PRs are off, because exact pins plus a release-age delay are the update policy.
status: stable
tags: [deps, security, ci]
source: forge A21
generated: { by: human:migrate, at: 2026-09-26T00:00:00Z }
---

Dependabot security alerts are on, but Dependabot version and security update PRs are off, because exact pins plus a release-age delay are the update policy.

## Why

Alerts tell us what is vulnerable; the owner decides the pin. Bot bumps would bypass the researched-pin rule.

## Context

Turn on vulnerability alerts and the dependency graph. Keep automated security fixes off and add no dependabot config file.

The repo pins every dependency exactly and delays new releases with pnpm's minimum release age. Bot PRs would bump pins outside that policy.
