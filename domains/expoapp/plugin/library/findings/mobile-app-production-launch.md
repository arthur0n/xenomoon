---
type: findings
title: Mobile app production launch — traps that cost real time
description: Clerk dev→prod, DNS/Cloudflare, SSM cutover, EAS and store gotchas hit for real during an Expo + Clerk production launch; includes the two Clerk settings invisible to `config pull`.
status: stable
tags: [launch, mobile]
generated: { by: human:migrate, at: 2026-11-08T18:51:42.888Z }
---

Clerk dev→prod, DNS/Cloudflare, SSM cutover, EAS and store gotchas hit for real during an Expo + Clerk production launch; includes the two Clerk settings invisible to `config pull`.

## Why

The full guide (seven sections: Clerk, DNS/Cloudflare, backend cutover, client/EAS, process traps,
debugging lessons, automation inventory) lives in the `production-launch` skill of the expoapp pack.
A record holds at most 20 body lines, so it keeps only this pointer; load the skill to use the guide.
