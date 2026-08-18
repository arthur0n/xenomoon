# Mobile app production launch — traps that cost real time

**Source:** a production launch of an Expo + Clerk mobile app, 2026-08-02 → 2026-08-06. Every entry
below was hit for real, not anticipated. Written so the next app pays for none of them twice.

**Scope:** Expo/React Native app, Clerk auth, Cloudflare Worker + AWS Lambda backend, shipped
via EAS to TestFlight and Google Play.

**How to use this:** read it once before starting a launch, then again when something behaves
inexplicably. It is a record, not a runbook — the per-project runbook is the executable thing.

---

## 1. Clerk

### 1.1 The prod instance is CLONED from dev — verify, don't assume either way

The common claim "nothing carries over from dev" was **false** for this app: a `clerk config pull`
diff of dev vs prod showed only **5 differing keys**. Almost everything carried over.

Two categories reliably do NOT carry over:

- **OAuth credentials** — dev rides Clerk's _shared_ credentials; production requires your own.
- **Bot protection** — off in dev, **on** in prod.

**Do this first, always:** `clerk config pull --instance dev` and `--instance prod`, then diff.
It converts "redo the dashboard checklist from memory" into a short table of exact deltas. It is
the single highest-value step of a Clerk cutover.

### 1.2 🔴 The config diff has a BLIND SPOT — two launch-critical settings are invisible

Neither appears in `clerk config pull`, nor in `clerk api ls`. A dev↔prod diff reports **"no
differences"** while both are unset:

| Setting                                                | Why it matters                                                | Where it lives                    |
| ------------------------------------------------------ | ------------------------------------------------------------- | --------------------------------- |
| **Native API** (bundle id / package name registration) | Without it, production CAPTCHA blocks **every native signup** | Dashboard → Native applications   |
| **"Users can delete their accounts"**                  | App Store 5.1.1(v) and Play both require in-app deletion      | Dashboard → User & authentication |

Add both as explicit **manual** checks to any mobile launch checklist. The tooling will not
remind you.

### 1.3 Production bot protection: the documented fix is impossible in React Native

Prod instances enable Smart CAPTCHA (Turnstile). Clerk's documented remedy for custom flows is to
render the widget into `<div id="clerk-captcha">`. **React Native has no DOM.**

The real answer is **Native API**: registering the bundle id "enables a public request pathway
through which CAPTCHA challenges are bypassed, even when Bot sign-up protection is enabled"
([docs](https://clerk.com/docs/guides/secure/bot-protection)).

**So: do NOT disable bot protection.** That was the obvious-looking move and it is the wrong one —
it drops a real anti-abuse control on a public test. Register the app instead.

Unconfirmed and not to be relied on: the docs say nothing about whether OAuth/token sign-ups are
exempt when Native API is off. Register the app.

### 1.4 Apple Key ID is not the App Store Connect app ID

Both are 10 characters, so a wrong paste type-checks as plausible.

|                                    | Format                             | From                                    |
| ---------------------------------- | ---------------------------------- | --------------------------------------- |
| ASC app ID (`eas.json` `ascAppId`) | 10 **digits** — `1234567890`       | App Store Connect listing               |
| Apple **Key ID**                   | 10 **alphanumeric** — `ABC123DEFG` | Developer portal → Keys, with the `.p8` |

An all-numeric value in Clerk's Apple Key ID field is almost certainly the ASC app id. Symptom:
Apple sign-in fails **on production only**, invisible while testers are still on dev.

### 1.5 Android Google sign-in uses the WEB client id — deliberately

The native Android app requests an ID token whose `aud` is scoped to the Google Cloud OAuth
**Web** client, because that is the identity the server side (Clerk) verifies. Using the
_Android_-type client id makes Clerk reject the exchange.

- client **id** → app bundle (`EXPO_PUBLIC_*`, public by design) **and** Clerk's Google connection
- client **secret** (`GOCSPX-…`) → **Clerk only**. No app or server code ever reads it.

They must be the same web client on both sides.

### 1.6 `clerk config pull` can hang

Observed hanging repeatedly (2- and 4-minute timeouts) while `clerk api` calls on the same
instance returned instantly. **Do not build a verification step that depends on it.** Have a
fallback: `clerk api /v1/...` directly, or the public `https://clerk.<domain>/v1/environment`.

### 1.7 The JWT public key is fetchable before DNS verifies

No dashboard visit and no waiting — `GET /v1/jwks` works on the Backend API immediately:

```bash
clerk api /v1/jwks --app <APP> --instance prod \
| node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s).keys[0];delete j.use;delete j.alg;console.log(require("crypto").createPublicKey({key:j,format:"jwk"}).export({type:"spki",format:"pem"}))})'
```

Compare the `kid` against the instance id to be sure you wired the right app.

### 1.8 The publishable key is derivable, not fetchable

`pk_live_$(echo -n 'clerk.<domain>$' | base64)`. Useful as a cross-check that you are looking at
the instance you think you are.

---

## 2. DNS / Cloudflare

### 2.1 Cloudflare **Error 1000** during Clerk provisioning is EXPECTED — do not debug it

When the Clerk hostname's parent zone is itself on Cloudflare, `clerk.<domain>` returns
**403 "DNS points to prohibited IP"** until Clerk registers the custom hostname on its side. The
grey CNAME resolves into Cloudflare's own IP space, so the zone's edge refuses it.

**The success signal is the certificate, not the status code:**

```bash
echo | openssl s_client -connect clerk.<domain>:443 -servername clerk.<domain> 2>/dev/null \
| openssl x509 -noout -subject
```

- `subject=CN=<domain>` → the zone's **wildcard** cert is answering. Still provisioning.
- `subject=CN=clerk.<domain>` → Clerk has registered the custom hostname. **Done.**

Cost of not knowing this: ~2 hours of misdiagnosis, including a confident and wrong root-cause
claim. Compare against a known-good Clerk domain in the same account before assuming breakage.

### 2.2 Provisioning is not always self-starting

An hour of polling produced nothing. Have the trigger to hand: `clerk deploy status` performs a
DNS check, but **requires `clerk link`** — link the repo early so this is available under pressure.

### 2.3 A parked domain's email posture fights Clerk

A domain previously parked (Squarespace, etc.) often carries:

```
TXT  @        "v=spf1 -all"                                    ← no host may send
TXT  _dmarc   "v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s" ← reject, strict
TXT  _domainkey "v=DKIM1; p="                                  ← null key
```

Clerk production sends **from your domain**. DMARC passes if _either_ SPF or DKIM aligns, and
Clerk's DKIM signs as `d=<domain>`, so it can pass on DKIM alone — but `-all` hard-fails SPF and
`p=reject` means any DKIM hiccup is **rejected outright**, not quarantined.

**Send one real email and confirm delivery before inviting anyone.** Unverified DKIM means Clerk
sends _zero_ email: no codes, no resets, no invites, and it fails silently.

### 2.4 All Clerk records grey / DNS-only

Proxying breaks Clerk SNI. Verify against the **authoritative** nameserver, not a public resolver:
`dig +short clerk.<domain> CNAME @<zone-ns>`. Records can take tens of seconds to appear.

### 2.5 Look for an existing DNS-edit token before minting one

An all-zones `Zone:DNS:Edit` token often already exists in a sibling project's `.env`. Test
candidates against the target zone before asking anyone to create another.

---

## 3. Backend cutover

### 3.1 🔴 No `DEPLOY_REV` ⇒ a green CI run that changes nothing

Non-versioned `{{resolve:ssm:...}}` is **not** change-detected by CloudFormation. Rotate an SSM
value, push with unchanged template/code, and CI reports success while the Lambda keeps the OLD
value. `--no-fail-on-empty-changeset` makes it green.

**Fix:** a `DEPLOY_REV` env var in `Globals.Function.Environment.Variables`, bumped in the _same
commit_ as the rotation. Bumping `samconfig.toml` does nothing — it is not part of the stack.

### 3.2 SSM params must be `String`, never `SecureString`

`{{resolve:ssm:...}}` only resolves `String`/`StringList`. A `SecureString` breaks the deploy.

### 3.3 One backend + one JWT key = an unrehearsable cutover

If there is no dev/prod split, `CLERK_JWT_KEY` is a single value with **no dual-accept window**.
Rotating it flips the only backend, and every installed build breaks at once. Know this before
promising a safe cutover — and note that a `${Environment}` parameter in the template makes a
split _look_ like it exists when it does not. Check for the actual stack and the actual SSM path.

---

## 4. Client / EAS

### 4.1 The publishable key is build-time — an instance switch needs a rebuild

The FAPI host is derived by decoding the pk. It cannot be hot-reloaded. **EAS env is the source of
truth**; a stale value there silently reverts the bundle on the next build.

### 4.2 Check every EAS environment, not just `production`

Observed: `preview` silently duplicated production (same prod URLs, same `pk_test`), and
`development` was completely empty. Both are traps if you assume they mean what they are named.

### 4.3 Store asymmetry — only Play is repo-configurable

|                                             | Repo-controllable?                                       | Notes                                                                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Play** track                              | ✅ `eas.json` `submit.production.android.track`          | Accepts `production` \| `beta` \| `alpha` \| `internal`. **Open testing = `beta`.**                                                                      |
| **TestFlight** external group + public link | ❌ not from `eas.json` — but ✅ via the ASC API (see §7) | The iOS `groups` field is _internal_ groups only. The public link IS scriptable through `POST /v1/betaGroups`. Beta App Review (~24–48 h) still applies. |

Sources: [EAS json](https://docs.expo.dev/eas/json/) ·
[Play tracks](https://developers.google.com/android-publisher/tracks)

⚠️ Google's tracks doc maps Internal testing to `qa` while EAS accepts `internal` — an
inconsistency. `internal` works in practice; only `beta` is corroborated by two sources.

---

## 5. Process traps (not tech)

### 5.1 Verify workflow trigger branches BEFORE adopting a branch model

Adding a `development` branch is worthless if the gates only fire on `main`. Check
`pull_request.branches` **and** `push.branches` on the validate/lint/secret-scan workflows.
Adopting the branch without this is strictly worse than not having it — work runs untested.

### 5.2 Verify a "costly" CI job actually is costly

A workflow named "live credits money-path battle", whose header comment said it spends real
Gemini/OpenAI credits, turned out to pass **no secrets at all** and make **no external calls** —
the name and comment were stale. Nearly caused an unnecessary redesign. Check `secrets.` usage and
the script itself before optimising around a cost that does not exist.

### 5.3 A shared database means dev has no blast radius

If dev and prod share a DB, the risks are: a bad migration breaks production instantly; dev code
writes real user rows; testing spends real credits; and the same auth instance means dev touches
the _same user identities_. These are inherent, not mitigable by process. Decide with eyes open.

### 5.4 "Closed = shipped", not "merged"

Where deploys are gated, an issue should close when the fix is **live**. For an app that does not
auto-deploy, code on `main` is not in users' hands. Leaving the issue open is the tracker telling
the truth.

---

## 6. Debugging lessons (earned the hard way)

- **An absence in logs is not evidence.** A missing `/ws` line in `wrangler tail` was read as "the
  socket never opened", and an entire causal chain was built on it. The socket _was_ open — the
  tail simply does not surface every event. Prefer positive evidence.
- **Platform split is the fastest triage.** One live request (`okhttp` = Android, succeeding) while
  iOS failed eliminated backend, DNS, auth and credits in one step — all of which are
  platform-blind. Get the user-agent early.
- **"Some users" vs "all users" is load-bearing.** A mechanism that would break everyone cannot
  explain a subset. Ask which it is before theorising.
- **Silent failure ≠ no failure.** `void somePromise()` at a call site with no `.catch()` discards
  rejections entirely: no toast, no log, no crash, and Sentry stays clean because nothing throws.
  Audit `void`-discarded async calls at UI entry points.
- **Sentry silence is information.** No errors during an incident means it is a _handled_ state,
  not a crash — which redirects the search entirely.

---

## 7. Automation inventory — what is scriptable, what is not

Verified 2026-08-06 by enumerating the installed `clerk` CLI's full endpoint catalogue (234
Backend + 53 Platform API endpoints) and checking Apple/Google APIs against official references.

### 🔴 Irreducibly MANUAL — no API exists, plan the time

| Step                                              | Evidence                                                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Apple "Sign in with Apple" `.p8` key + Key ID** | No `authKeys`/SIWA-key resource in the ASC API. `spaceship` screen-scrapes the portal and is blocked by 2FA — not CI-safe.                             |
| **Apple Services ID identifier**                  | ASC API `bundleIds` covers app IDs only. fastlane `produce` can toggle the SIWA _capability_ on a bundle id, which is a different object.              |
| **App Privacy / nutrition label**                 | fastlane's own docs: _"The APIs this action uses are not available on the official App Store Connect API."_ Undocumented internal endpoint + 2FA only. |
| **Play content rating (IARC)**                    | No `contentRating` resource anywhere in the android-publisher API. fastlane#13140 requested it in 2018, closed unresolved.                             |
| **AWS SSM secret _rotation_**                     | Parameter Store has no rotation API at all. Creation/update is scriptable; scheduled rotation needs Secrets Manager or hand-rolled EventBridge+Lambda. |

### ✅ Automatable — and worth wiring up

| Step                                        | How                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------- |
| **TestFlight external group + PUBLIC LINK** | `POST /v1/betaGroups` with `isInternalGroup:false`, `publicLinkEnabled`, `publicLinkLimit`. ASC API key auth, no 2FA.                                                                                                                                                                                        |
| **Submit for Beta App Review**              | `POST /v1/betaAppReviewSubmissions`; fastlane `pilot` exposes `submit_beta_review`. Fully CI-safe.                                                                                                                                                                                                           |
| **Age rating**                              | `PATCH /v1/appStoreVersions/{id}/ageRatingDeclaration`. fastlane `deliver`'s `app_rating_config_path`. ⚠️ fastlane's field coverage lags Apple's newer questionnaire items.                                                                                                                                  |
| **Play Data Safety form**                   | `POST /androidpublisher/v3/applications/{pkg}/dataSafety` with a CSV in `safetyLabels`. **No fastlane support** — raw API call required. ⚠️ Two research passes disagreed on whether this resource exists; confirmed present by reading the v3 resource list directly. Verify before trusting either answer. |
| **Play promote internal → open testing**    | `supply --track internal --track_promote_to beta --track_promote_release_status completed`.                                                                                                                                                                                                                  |
| **Clerk JWKS / public key**                 | `GET /jwks`, or unauthenticated at `https://clerk.<domain>/.well-known/jwks.json`.                                                                                                                                                                                                                           |
| **Clerk DNS verification**                  | Platform API `POST .../domains/{id}/dns_check` + `GET .../status`; CLI `clerk deploy status --wait`.                                                                                                                                                                                                         |
| **EAS env vars**                            | `eas env:create                                                                                                                                                                                                                                                                                              | update | list --environment <env> --non-interactive`(+`--visibility`). |
| **Cloudflare DNS / worker secrets**         | `POST /zones/{id}/dns_records`; `echo "$V" \| wrangler secret put NAME` or `wrangler secret bulk`. In CI, `CLOUDFLARE_API_TOKEN` overrides any stored OAuth session.                                                                                                                                         |

### ⚠️ Unconfirmed — verify before relying on either answer

- **Clerk Native API bundle-id registration.** Searched all 287 endpoints for `native`/`bundle`/
  `package`/`mobile` — **zero matches**. Possibly reachable via the generic `clerk config patch`
  settings blob, but the schema key is unconfirmed. Treat as dashboard-only until proven.
- **Clerk "users can delete their accounts".** Likely a `user_settings` key inside the same config
  blob; exact key unconfirmed.
- **Clerk Platform API auth in CI.** `clerk config patch/put/pull` have **no `--secret-key` flag** —
  they depend on the browser-OAuth session from `clerk auth login`. Whether that session file can be
  seeded as a CI secret is unverified. This is the main obstacle to fully scripting a Clerk cutover.

### 🔴 The Play API cannot bootstrap a new app

Google, verbatim: _"You can only use this API to make changes to an existing app (that has at
least one APK uploaded); thus, you will have to upload at least one APK through the Play Console
before you can use this API."_

So **the first Android upload is always manual**, and no amount of scripting removes it. fastlane
states the same constraint. Related: publishing can fail outright if the **App content** section
isn't filled in first — privacy policy, ads, target audience, permissions declaration, content
rating. None of those has an API resource (`edits.details` carries only `defaultLanguage` and the
three contact fields). They are a **hard one-time dashboard gate before any CI pipeline works at
all**.

### Practical consequence

The Clerk _instance config_ is scriptable but its auth is interactive; the Apple _credential
creation_ is not scriptable at all; and the Play pipeline cannot start until a human has uploaded
a build and completed App content. So every launch contains three irreducible manual blocks:

1. **Apple portal** — `.p8` key + Services ID
2. **Store questionnaires** — App Privacy (iOS), content rating + App content (Play)
3. **Play bootstrap** — the first APK/AAB upload by hand

**Budget for these explicitly rather than discovering them mid-launch.** Automation buys you the
_repeat_ runs, not the first one.

---

## Related

- `clerk-prod-setup` skill (`~/.claude/skills/`) — CLI-driven prod Clerk setup. **Written for web
  projects.** On mobile it must not be followed verbatim: the publishable key goes to the **EAS
  environment**, not a GitHub `VITE_*` secret; the `clerk-captcha` div remedy is impossible; and it
  does not cover the worker secret, Apple/Google credentials, or a dev→prod cutover with existing
  users.
