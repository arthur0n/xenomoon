---
name: auth-database-single-runtime-account
kind: verdicts
description: The database holding the access hub's ACL, grants and consents is reachable by exactly one runtime service account; any other service that needs Firestore gets its own named database with a conditioned grant.
status: accepted
tags: [auth, security, infra]
date: 2026-10-04
source: hub M22
---

# The auth database belongs to one runtime account

## Context

The access hub is the crown jewels. Its default Firestore database holds the ACL and the OAuth, consent
and job stores. Any principal that can write it can edit who may enter or forge a grant without defeating
the access hub. An unused agent service still held the same project-level datastore role.

## Decision

- Project-level `roles/datastore.user` has exactly one member: the access hub runtime account. Only the
  deployer account may attach it to a service, and CI reaches the deployer through workload identity
  federation.
- No other runtime account holds a datastore role, project-level token-creator, or editor/owner-style
  roles that reach the database indirectly; the default compute account loses `roles/editor`.
- A service that needs Firestore gets its own named database and a grant conditioned on that database.
  IAM conditions apply per database, not per collection; a collection prefix prevents collisions, not
  access.
- The setup script refuses any other runtime or deployer identity before any cloud call.
- Proven by IAM policy evaluation (Policy Troubleshooter), accepted as sufficient for now.

## Why

Every account with datastore permissions is inside the access hub's trust boundary. Not adopted: a second
database now (nothing else uses Firestore), a separate project (more identities to keep), keeping the
shared role.
