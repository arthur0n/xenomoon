---
name: acl-pending-grant-by-email
kind: verdicts
description: An operator adds a person by email as a pending grant, and the access hub resolves the identity-provider oid itself at that person's first sign-in by matching the signed token's UPN, never the unverified email claim.
status: accepted
tags: [auth, security]
date: 2026-10-07
source: hub M23
---

# Add a person by email; resolve the oid at first sign-in

## Context

The ACL is keyed by the identity provider's object id (`oid`). Onboarding is an operator action done by
email; the `oid` is an implementation detail. Looking it up through Graph would need an application
permission, an IT change.

## Decision

- The ACL CLI `add --email` writes a pending document keyed by the lower-cased email. ACL user documents
  stay keyed by `oid`.
- At the login callback, after every existing check, if no user document exists for the `oid`, look up a
  pending document for the token's `preferred_username` (the tenant-controlled UPN), canonical form,
  exact. On a match, one transaction creates the user document and deletes the pending one. No match:
  the session is issued and the portal is empty.
- The `email` claim is never matched: the identity provider does not guarantee it is verified.
- The ID token comes from the back-channel code exchange (client secret plus PKCE), never the browser.
- Other CLI commands accept email or `oid`; an email matching two users is a refusal naming both.

## Why

Members cannot edit their own UPN; tenant admins can, and already decide who is in the tenant. This
trusts the token exactly as far as the `oid`-keyed ACL already does. Not adopted: Graph lookup at add time,
or asking the person to sign in first so the operator can copy an id.
